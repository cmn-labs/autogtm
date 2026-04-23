import { addLeadsToCampaign } from '../clients/instantly';
import {
  getSupabaseClient,
  incrementCampaignLeadCount,
  markLeadRouted,
  markLeadSkipped,
} from '../db/autogtmDbCalls';
import { sendDraftCampaignForLead } from './createCampaignForPersona';
import { regenerateEmailSequenceWithFeedback } from '../ai/generateEmailCopy';

/** Default feedback used when Autopilot regenerates stale draft copy before sending. */
const AUTO_REGENERATE_FEEDBACK =
  "This draft may be stale or templated. Rewrite the sequence so the opening hook references a specific detail from this lead's bio, expertise, or audience — nothing generic. Keep copy concise and personal; avoid templated phrasing in subjects.";

/**
 * Regenerate a draft campaign's email copy fresh for the given lead and persist
 * the new sequence (with a version snapshot so undo still works). Used by
 * Autopilot when `auto_add_regenerate_drafts` is enabled, so stale copy doesn't
 * go out on autosend.
 *
 * No-op (returns false) when the campaign is not a draft or has no existing emails.
 */
export async function regenerateAndSaveDraftEmails(params: {
  campaignId: string;
  leadId: string;
}): Promise<boolean> {
  const { campaignId, leadId } = params;
  const supabase = getSupabaseClient();

  const [{ data: campaign }, { data: emails }, { data: lead }] = await Promise.all([
    supabase.from('campaigns').select('id, company_id, status, persona').eq('id', campaignId).single(),
    supabase.from('campaign_emails').select('step, subject, body, delay_days').eq('campaign_id', campaignId).order('step', { ascending: true }),
    supabase.from('leads').select('id, full_name, category, bio').eq('id', leadId).single(),
  ]);

  if (!campaign || campaign.status !== 'draft') return false;
  if (!emails || emails.length === 0) return false;
  if (!lead) return false;

  const { data: company } = await supabase
    .from('companies')
    .select('name, description, target_audience, default_sequence_length, email_prompt')
    .eq('id', campaign.company_id)
    .single();
  if (!company) return false;

  const targetPersona = [
    campaign.persona || null,
    lead.category ? `Category: ${lead.category}` : null,
    lead.full_name ? `Lead: ${lead.full_name}` : null,
    lead.bio ? `Bio: ${lead.bio}` : null,
    company.target_audience ? `Target audience: ${company.target_audience}` : null,
  ].filter(Boolean).join(' | ');

  const regenerated = await regenerateEmailSequenceWithFeedback({
    companyName: company.name,
    companyDescription: company.description,
    valueProposition: company.description,
    targetPersona,
    existingSequence: emails as Array<{ step: number; subject: string; body: string; delay_days: number }>,
    feedback: AUTO_REGENERATE_FEEDBACK,
    sequenceLength: company.default_sequence_length,
    customPrompt: company.email_prompt,
  });

  const nextEmails: Array<{ step: number; subject: string; body: string; delay_days: number }> = [
    { step: 0, subject: regenerated.initial.subject, body: regenerated.initial.body, delay_days: 0 },
    { step: 1, subject: regenerated.followUp1.subject, body: regenerated.followUp1.body, delay_days: regenerated.followUp1.delayDays },
  ];
  if (regenerated.followUp2) {
    nextEmails.push({ step: 2, subject: regenerated.followUp2.subject, body: regenerated.followUp2.body, delay_days: regenerated.followUp2.delayDays });
  }

  // Snapshot current version so undo still works after Autopilot regenerates.
  const { data: latestVersionRows } = await supabase
    .from('campaign_email_versions')
    .select('version_number')
    .eq('campaign_id', campaignId)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = ((latestVersionRows as Array<{ version_number: number }> | null)?.[0]?.version_number || 0) + 1;
  await supabase.from('campaign_email_versions').insert(
    (emails as Array<{ step: number; subject: string; body: string; delay_days: number }>).map((e) => ({
      campaign_id: campaignId,
      version_number: nextVersion,
      step: e.step,
      subject: e.subject,
      body: e.body,
      delay_days: e.delay_days,
    }))
  );

  // Replace current sequence with the regenerated copy.
  await supabase.from('campaign_emails').delete().eq('campaign_id', campaignId);
  await supabase.from('campaign_emails').insert(nextEmails.map((e) => ({
    campaign_id: campaignId,
    step: e.step,
    subject: e.subject,
    body: e.body,
    delay_days: e.delay_days,
    updated_at: new Date().toISOString(),
  })));

  return true;
}

/** Result of attempting to add a single lead to its suggested campaign. */
export type AddLeadToCampaignResult =
  | { ok: true; action: 'sent_draft' | 'added_to_active'; campaignId: string; regenerated?: boolean }
  | { ok: false; reason: 'missing_email' | 'missing_name' | 'campaign_not_found' | 'campaign_full' | 'campaign_not_accepting' | 'lead_not_found' | 'error'; message?: string };

/**
 * Shared core routine for routing a single lead into its suggested campaign.
 * Used by both the user-initiated add-to-campaign Inngest job and the
 * daily Auto Add sweep so behavior stays identical across paths.
 *
 * Caller is responsible for Inngest step wrapping / retries.
 */
export async function addLeadToCampaignCore(params: {
  leadId: string;
  campaignId: string;
  /** When true, respects campaign cap/accepting flag and returns a structured skip
   *  reason instead of throwing. Used by the sweep to track reasons per-lead. */
  softFail?: boolean;
  /** When true and the lead is soft-failed as full/not-accepting, mark it skipped
   *  in the DB so the sweep doesn't re-consider it tomorrow. */
  markSkipped?: boolean;
  /** When true, regenerate & persist fresh draft copy BEFORE routing — only
   *  applies when the campaign is still a draft. Used by Autopilot when the
   *  `auto_add_regenerate_drafts` company preference is enabled. */
  regenerateDraftFirst?: boolean;
}): Promise<AddLeadToCampaignResult> {
  const { leadId, campaignId, softFail = false, markSkipped = false, regenerateDraftFirst = false } = params;
  const supabase = getSupabaseClient();

  const [{ data: lead }, { data: campaign }] = await Promise.all([
    supabase.from('leads').select('email, full_name, title, bio, url, total_audience').eq('id', leadId).single(),
    supabase.from('campaigns').select('id, instantly_campaign_id, status, is_accepting_leads, leads_count, max_leads').eq('id', campaignId).single(),
  ]);

  if (!lead) {
    if (softFail) return { ok: false, reason: 'lead_not_found' };
    throw new Error(`Lead ${leadId} not found`);
  }
  if (!lead.email?.trim()) {
    if (softFail) return { ok: false, reason: 'missing_email' };
    throw new Error(`Lead ${leadId} has no email`);
  }
  if (!lead.full_name?.trim()) {
    if (softFail) return { ok: false, reason: 'missing_name' };
    throw new Error(`Lead ${leadId} has no name - skipping to avoid blank {{first_name}}`);
  }
  if (!campaign) {
    if (softFail) return { ok: false, reason: 'campaign_not_found' };
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Cap / accepting guardrails (sweep only — manual confirm already implies user intent)
  if (softFail) {
    if (!campaign.is_accepting_leads) {
      if (markSkipped) await markLeadSkipped(leadId, 'campaign_not_accepting');
      return { ok: false, reason: 'campaign_not_accepting' };
    }
    if ((campaign.leads_count || 0) >= (campaign.max_leads || 500)) {
      if (markSkipped) await markLeadSkipped(leadId, 'campaign_full');
      return { ok: false, reason: 'campaign_full' };
    }
  }

  if (campaign.status === 'draft' || !campaign.instantly_campaign_id) {
    let regenerated = false;
    if (regenerateDraftFirst) {
      regenerated = await regenerateAndSaveDraftEmails({ campaignId, leadId });
    }
    await sendDraftCampaignForLead({ campaignId, leadId });
    return { ok: true, action: 'sent_draft', campaignId, regenerated };
  }

  const nameParts = lead.full_name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  await addLeadsToCampaign(campaign.instantly_campaign_id, [{
    email: lead.email.trim(),
    first_name: firstName,
    last_name: lastName,
    company_name: '',
    variables: {
      lead_url: lead.url || '',
      title: lead.title || '',
      bio: lead.bio || '',
      audience_size: String(lead.total_audience || ''),
    },
  }]);

  await markLeadRouted(leadId, campaignId);
  await incrementCampaignLeadCount(campaignId);

  return { ok: true, action: 'added_to_active', campaignId };
}
