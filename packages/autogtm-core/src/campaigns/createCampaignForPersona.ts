/**
 * Creates a new Instantly campaign for a given persona,
 * generates AI email copy, and saves everything to DB as draft.
 * Campaign is activated when the first lead is added.
 */

import {
  createCampaign as createInstantlyCampaign,
} from '../clients/instantly';
import { generateEmailSequence } from '../ai/generateEmailCopy';
import {
  createCampaign as createCampaignRecord,
  createCampaignEmails,
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
}

export async function createCampaignForPersona(
  params: CreateCampaignForPersonaParams
): Promise<Campaign> {
  const { company, suggestedName, suggestedPersona } = params;

  // 1. Generate email copy tailored to this persona
  const sequenceLength = company.default_sequence_length ?? 2;
  const emailSequence = await generateEmailSequence({
    companyName: company.name,
    companyDescription: company.description,
    valueProposition: company.description,
    targetPersona: `${suggestedPersona} - ${company.target_audience}`,
    tone: 'friendly',
    sequenceLength,
    customPrompt: company.email_prompt,
  });

  // 2. Create campaign in Instantly
  const campaignName = `autogtm - ${suggestedName}`;
  const sequences = [
    { subject: emailSequence.initial.subject, body: textToHtml(emailSequence.initial.body) },
    { subject: emailSequence.followUp1.subject, body: textToHtml(emailSequence.followUp1.body), delay: emailSequence.followUp1.delayDays },
  ];
  if (emailSequence.followUp2) {
    sequences.push({ subject: emailSequence.followUp2.subject, body: textToHtml(emailSequence.followUp2.body), delay: emailSequence.followUp2.delayDays });
  }
  const instantlyCampaign = await createInstantlyCampaign({
    name: campaignName,
    emailList: company.sending_emails?.length ? company.sending_emails : [process.env.INSTANTLY_SENDER_EMAIL || ''],
    sequences,
  });

  // 3. Save campaign record in our DB
  const campaignRecord = await createCampaignRecord({
    company_id: company.id,
    instantly_campaign_id: instantlyCampaign.id,
    name: instantlyCampaign.name,
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

  // 4. Save email copies for reference
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
