/**
 * AI agent that decides whether to create a per-lead campaign draft or skip.
 * 
 * Given an enriched lead and company context, the agent decides:
 * create a new campaign draft, or skip.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type { Lead, CampaignWithStats, Company, CampaignRoutingDecision } from '../types';

const RoutingDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_new'),
    suggestedName: z.string(),
    suggestedPersona: z.string(),
    reason: z.string(),
  }),
  z.object({
    action: z.literal('skip'),
    reason: z.string(),
  }),
]);

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  return new OpenAI({ apiKey });
}

export interface DetermineCampaignParams {
  lead: Pick<Lead,
    'email' | 'full_name' | 'category' | 'platform' | 'bio' |
    'expertise' | 'total_audience' | 'content_types' |
    'promotion_fit_score' | 'promotion_fit_reason'
  >;
  campaigns: CampaignWithStats[];
  company: Pick<Company, 'name' | 'description' | 'target_audience'>;
  autoMode?: boolean;
}

export async function determineCampaignForLead(
  params: DetermineCampaignParams
): Promise<CampaignRoutingDecision> {
  const { lead, campaigns, company } = params;

  // Quick guard: no email = skip
  if (!lead.email) {
    return { action: 'skip', reason: 'Lead has no email address' };
  }

  const openai = getOpenAIClient();

  const systemPrompt = `You are a campaign routing agent for an outbound email system.

Your job is to decide whether a newly enriched lead should receive a unique per-lead campaign:
1. **create_new** - Generate a unique campaign draft for this lead
2. **skip** - Lead is not worth emailing (low fit score, irrelevant, no email, etc.)

Decision guidelines:
- Create persona-specific campaign names grounded in the lead's profile and company audience
- A lead with promotion_fit_score <= 3 should generally be skipped
- When creating a new campaign, suggest a clear persona name and descriptive campaign name
- Be concise in your reasoning (1-2 sentences max)

Return ONLY valid JSON matching one of these shapes:
{ "action": "create_new", "suggestedName": "...", "suggestedPersona": "...", "reason": "..." }
{ "action": "skip", "reason": "..." }`;

  const campaignSummaries = campaigns
    .filter(c => c.is_accepting_leads && c.status === 'active')
    .map(c => ({
      id: c.id,
      name: c.name,
      persona: c.persona,
      leads_count: c.leads_count,
      max_leads: c.max_leads,
      emails_sent: c.emails_sent,
      open_rate: `${(c.open_rate * 100).toFixed(1)}%`,
      reply_rate: `${(c.reply_rate * 100).toFixed(1)}%`,
    }));

  const userPrompt = `Route this lead to a campaign.

**Lead:**
- Name: ${lead.full_name || 'Unknown'}
- Email: ${lead.email}
- Category: ${lead.category || 'unknown'}
- Platform: ${lead.platform || 'unknown'}
- Bio: ${lead.bio || 'N/A'}
- Expertise: ${lead.expertise?.join(', ') || 'N/A'}
- Audience: ${lead.total_audience?.toLocaleString() || 'Unknown'}
- Content Types: ${lead.content_types?.join(', ') || 'N/A'}
- Fit Score: ${lead.promotion_fit_score || 'N/A'}/10
- Fit Reason: ${lead.promotion_fit_reason || 'N/A'}

**Company:** ${company.name}
- Description: ${company.description}
- Target Audience: ${company.target_audience}

**Available Campaigns (${campaignSummaries.length}):**
${campaignSummaries.length > 0
    ? JSON.stringify(campaignSummaries, null, 2)
    : 'Not used for routing in this mode.'}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI for campaign routing');
  }

  try {
    const parsed = JSON.parse(content);
    return RoutingDecisionSchema.parse(parsed) as CampaignRoutingDecision;
  } catch (error) {
    console.error('Failed to parse routing decision:', content);
    throw new Error(`Failed to parse campaign routing decision: ${error}`);
  }
}
