import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { regenerateEmailSequenceWithFeedback } from '@autogtm/core/ai/generateEmailCopy';
import { resolveOutreachPromptForLead } from '@/lib/outreachPromptResolver';

const RegeneratePayloadSchema = z.object({
  leadId: z.string().uuid(),
  feedback: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const payload = RegeneratePayloadSchema.parse(await request.json());

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [{ data: campaign }, { data: emails }, { data: lead }] = await Promise.all([
      supabase
        .from('campaigns')
        .select('id, company_id, status, persona')
        .eq('id', campaignId)
        .single(),
      supabase
        .from('campaign_emails')
        .select('step, subject, body, delay_days')
        .eq('campaign_id', campaignId)
        .order('step', { ascending: true }),
      supabase
        .from('leads')
        .select('id, full_name, category, bio, exa_queries!inner(company_id)')
        .eq('id', payload.leadId)
        .single(),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be regenerated' }, { status: 400 });
    }
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const leadCompanyId = (lead.exa_queries as any)?.company_id;
    if (!leadCompanyId || leadCompanyId !== campaign.company_id) {
      return NextResponse.json({ error: 'Lead does not belong to this campaign company' }, { status: 400 });
    }
    if (!emails || emails.length === 0) {
      return NextResponse.json({ error: 'No draft emails found for campaign' }, { status: 400 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('name, description, target_audience, default_sequence_length, email_prompt')
      .eq('id', campaign.company_id)
      .single();
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const resolvedPrompt = await resolveOutreachPromptForLead({
      supabase,
      companyId: campaign.company_id,
      leadId: payload.leadId,
      companyEmailPrompt: company.email_prompt,
    });
    console.log('[prompt-resolution] regenerate', { campaignId, leadId: payload.leadId, source: resolvedPrompt.source });

    const targetPersona = [
      campaign.persona || null,
      lead.category ? `Category: ${lead.category}` : null,
      lead.full_name ? `Lead: ${lead.full_name}` : null,
      lead.bio ? `Bio: ${lead.bio}` : null,
      company.target_audience ? `Target audience: ${company.target_audience}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const regenerated = await regenerateEmailSequenceWithFeedback({
      companyName: company.name,
      companyDescription: company.description,
      valueProposition: company.description,
      targetPersona,
      existingSequence: emails,
      feedback: payload.feedback,
      sequenceLength: company.default_sequence_length,
      customPrompt: resolvedPrompt.prompt,
    });

    const nextEmails = [
      { step: 0, subject: regenerated.initial.subject, body: regenerated.initial.body, delay_days: 0 },
      { step: 1, subject: regenerated.followUp1.subject, body: regenerated.followUp1.body, delay_days: regenerated.followUp1.delayDays },
    ];
    if (regenerated.followUp2) {
      nextEmails.push({ step: 2, subject: regenerated.followUp2.subject, body: regenerated.followUp2.body, delay_days: regenerated.followUp2.delayDays });
    }

    // Important: do not persist, only return proposed sequence.
    return NextResponse.json({ emails: nextEmails });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid regenerate payload' }, { status: 400 });
    }
    console.error('Error regenerating draft campaign:', error);
    return NextResponse.json({ error: 'Failed to regenerate campaign draft' }, { status: 500 });
  }
}
