import {
  createCampaign as createInstantlyCampaign,
  activateCampaign,
  addLeadsToCampaign,
} from '../clients/instantly';
import { generateEmailSequence } from '../ai/generateEmailCopy';
import {
  createCampaign as createCampaignRecord,
  createCampaignEmails,
  getCampaign,
  getCampaignEmails,
  getSupabaseClient,
  incrementCampaignLeadCount,
  markLeadRouted,
  updateCampaign,
} from '../db/autogtmDbCalls';
import type { Company, Campaign } from '../types';

/** Convert plain text email body to HTML for Instantly */
function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map(para => `<div>${para.replace(/\n/g, '<br>')}</div>`)
    .join('<div><br></div>');
}

export interface CreateCampaignForPersonaParams {
  company: Pick<Company, 'id' | 'name' | 'description' | 'target_audience'> & { sending_emails?: string[]; default_sequence_length?: number; email_prompt?: string | null };
  suggestedName: string;
  suggestedPersona: string;
  leadId: string;
  leadFullName?: string | null;
  leadBio?: string | null;
  leadCategory?: string | null;
}

export async function createDraftCampaignForLead(
  params: CreateCampaignForPersonaParams
): Promise<Campaign> {
  const { company, suggestedName, suggestedPersona, leadId, leadFullName, leadBio, leadCategory } = params;

  // Generate email copy tailored to this lead persona
  const sequenceLength = company.default_sequence_length ?? 2;
  const personaContext = [
    suggestedPersona,
    leadCategory ? `Category: ${leadCategory}` : null,
    leadFullName ? `Lead: ${leadFullName}` : null,
    leadBio ? `Bio: ${leadBio}` : null,
    company.target_audience ? `Target audience: ${company.target_audience}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const emailSequence = await generateEmailSequence({
    companyName: company.name,
    companyDescription: company.description,
    valueProposition: company.description,
    targetPersona: personaContext,
    tone: 'friendly',
    sequenceLength,
    customPrompt: company.email_prompt,
  });

  // Save draft campaign record in our DB
  const campaignName = `autogtm - ${suggestedName}`;
  const campaignRecord = await createCampaignRecord({
    company_id: company.id,
    source_lead_id: leadId,
    draft_type: 'lead',
    instantly_campaign_id: null,
    name: campaignName,
    status: 'draft',
    leads_count: 0,
    emails_sent: 0,
    opens: 0,
    replies: 0,
    persona: suggestedPersona,
    target_criteria: {},
    is_accepting_leads: true,
    max_leads: 500,
  });

  // Save email copies for draft editing and send-time execution
  const emailRecords = [
    { campaign_id: campaignRecord.id, step: 0, subject: emailSequence.initial.subject, body: emailSequence.initial.body, delay_days: 0 },
    { campaign_id: campaignRecord.id, step: 1, subject: emailSequence.followUp1.subject, body: emailSequence.followUp1.body, delay_days: emailSequence.followUp1.delayDays },
  ];
  if (emailSequence.followUp2) {
    emailRecords.push({ campaign_id: campaignRecord.id, step: 2, subject: emailSequence.followUp2.subject, body: emailSequence.followUp2.body, delay_days: emailSequence.followUp2.delayDays });
  }
  await createCampaignEmails(emailRecords);

  return campaignRecord;
}

export async function sendDraftCampaignForLead(params: {
  campaignId: string;
  leadId: string;
  companySendingEmails?: string[] | null;
}): Promise<Campaign> {
  const { campaignId, leadId } = params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  if (campaign.status !== 'draft' && campaign.instantly_campaign_id) {
    return campaign;
  }

  const emails = await getCampaignEmails(campaignId);
  if (!emails.length) {
    throw new Error(`Campaign ${campaignId} has no email steps`);
  }

  const supabase = getSupabaseClient();
  const fallbackCompanySendingEmails = params.companySendingEmails?.length
    ? params.companySendingEmails
    : (await supabase
        .from('companies')
        .select('sending_emails')
        .eq('id', campaign.company_id)
        .single()
      ).data?.sending_emails || [];

  const { data: lead } = await supabase
    .from('leads')
    .select('id, email, full_name, title, bio, url, total_audience')
    .eq('id', leadId)
    .single();

  if (!lead?.email?.trim()) {
    throw new Error(`Lead ${leadId} has no email`);
  }
  if (!lead?.full_name?.trim()) {
    throw new Error(`Lead ${leadId} has no name`);
  }

  const sequences = emails.map((email, index) => ({
    subject: email.subject,
    body: textToHtml(email.body),
    delay: index === 0 ? 0 : email.delay_days,
  }));

  const instantlyCampaign = await createInstantlyCampaign({
    name: campaign.name,
    emailList: fallbackCompanySendingEmails.length ? fallbackCompanySendingEmails : [process.env.INSTANTLY_SENDER_EMAIL || ''],
    sequences,
  });

  await activateCampaign(instantlyCampaign.id);

  const updatedCampaign = await updateCampaign(campaign.id, {
    instantly_campaign_id: instantlyCampaign.id,
    status: 'active',
  });

  const nameParts = lead.full_name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  await addLeadsToCampaign(instantlyCampaign.id, [{
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

  await markLeadRouted(leadId, campaign.id);
  await incrementCampaignLeadCount(campaign.id);

  return updatedCampaign;
}

// Backward-compatible export name while callers migrate.
export async function createCampaignForPersona(
  params: CreateCampaignForPersonaParams
): Promise<Campaign> {
  return createDraftCampaignForLead(params);
}
