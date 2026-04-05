import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { determineCampaignForLead } from '@autogtm/core/ai/determineCampaign';
import { setSuggestedCampaign, markLeadSkipped, getCampaignBySourceLeadId } from '@autogtm/core/db/autogtmDbCalls';
import { createDraftCampaignForLead } from '@autogtm/core/campaigns/createCampaignForPersona';
import { resolveOutreachPromptForLead } from '@/lib/outreachPromptResolver';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get lead with enrichment data
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        id, email, full_name, category, platform, bio, expertise,
        total_audience, content_types, promotion_fit_score, promotion_fit_reason,
        url, enrichment_status,
        exa_queries!inner(company_id)
      `)
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (lead.enrichment_status !== 'enriched') {
      return NextResponse.json({ error: 'Lead must be enriched first' }, { status: 400 });
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email' }, { status: 400 });
    }

    const companyId = (lead.exa_queries as any).company_id;

    // Get company
    const { data: company } = await supabase
      .from('companies')
      .select('name, description, target_audience, sending_emails, default_sequence_length, email_prompt')
      .eq('id', companyId)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const decision = await determineCampaignForLead({
      lead: {
        email: lead.email,
        full_name: lead.full_name,
        category: lead.category,
        platform: lead.platform,
        bio: lead.bio,
        expertise: lead.expertise,
        total_audience: lead.total_audience,
        content_types: lead.content_types,
        promotion_fit_score: lead.promotion_fit_score,
        promotion_fit_reason: lead.promotion_fit_reason,
      },
      campaigns: [],
      company: { name: company.name, description: company.description, target_audience: company.target_audience },
      autoMode: true,
    });

    if (decision.action === 'skip') {
      await markLeadSkipped(leadId, decision.reason);
      return NextResponse.json({ action: 'skipped', reason: decision.reason });
    }

    const existingDraft = await getCampaignBySourceLeadId(leadId);
    if (existingDraft) {
      await setSuggestedCampaign(leadId, existingDraft.id, decision.reason);
      return NextResponse.json({ action: 'suggested', campaignId: existingDraft.id, reason: decision.reason });
    }

    const resolvedPrompt = await resolveOutreachPromptForLead({
      supabase,
      companyId,
      leadId,
      companyEmailPrompt: company.email_prompt,
    });

    const newCampaign = await createDraftCampaignForLead({
      company: { id: companyId, name: company.name, description: company.description, target_audience: company.target_audience, sending_emails: company.sending_emails, default_sequence_length: company.default_sequence_length, email_prompt: company.email_prompt },
      resolvedEmailPrompt: resolvedPrompt.prompt,
      suggestedName: decision.suggestedName,
      suggestedPersona: decision.suggestedPersona,
      leadId,
      leadFullName: lead.full_name,
      leadBio: lead.bio,
      leadCategory: lead.category,
    });
    const campaignId = newCampaign.id;

    await setSuggestedCampaign(leadId, campaignId, decision.reason);

    return NextResponse.json({ action: 'suggested', campaignId, reason: decision.reason });
  } catch (error) {
    console.error('Error suggesting campaign:', error);
    return NextResponse.json({ error: 'Failed to suggest campaign' }, { status: 500 });
  }
}
