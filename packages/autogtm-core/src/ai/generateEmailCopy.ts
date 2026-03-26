/**
 * AI-powered cold email generation
 * Creates personalized email sequences for outreach campaigns
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type { GeneratedEmailSequence } from '../types';

const EmailSequenceSchema = z.object({
  initial: z.object({
    subject: z.string(),
    body: z.string(),
  }),
  followUp1: z.object({
    subject: z.string(),
    body: z.string(),
    delayDays: z.number(),
  }),
  followUp2: z.object({
    subject: z.string(),
    body: z.string(),
    delayDays: z.number(),
  }).optional(),
});

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  return new OpenAI({ apiKey });
}

export interface GenerateEmailParams {
  companyName: string;
  companyDescription: string;
  valueProposition: string;
  targetPersona: string;
  tone?: 'casual' | 'professional' | 'friendly';
  callToAction?: string;
  sequenceLength?: number; // 1 = initial only, 2 = initial + 1 follow-up, 3 = initial + 2 follow-ups. Default 2.
  customPrompt?: string | null; // Custom system prompt. If null/undefined, uses default.
}

export const DEFAULT_EMAIL_PROMPT = `You write outbound email sequences on behalf of a company founder. You sound like a confident, grounded, product-first founder.

Your communication style is direct, concise, data-backed, and highly personalized. You write like a real founder who has done the work, not like a marketer. Short paragraphs. Clean structure. No fluff.

Focus on real customer impact. Use specific proof points provided in the company context: user counts, time saved, measurable outcomes, social proof links. Do not mention revenue, ARR, fundraising, valuation, or corporate background.

Tone guidelines:
- Confident but calm
- Conversational but professional
- No hype
- No corporate jargon
- No exclamation marks
- ABSOLUTELY NO EM DASHES (— or --). Use commas, periods, or semicolons instead. This is critical. DO NOT LOOK LIKE AN AI.
- No buzzwords like exciting, thrilled, empower, streamline, leverage
- No generic flattery

Formatting rules:
- {{firstName}} is the ONLY personalization variable
- Plain text only
- No HTML
- No bullet points
- Paragraphs must be 1 to 3 sentences max
- Sign off with the sender's first name. Never "[Your Name]".
- Follow-up subject lines must be "" so they thread.

STRUCTURE FOR THE SEQUENCE:

INITIAL EMAIL:
- Start with: Hey {{firstName}},
- First sentence must reference something specific about the persona. It must feel researched and relevant.
- Introduce yourself and the product in 1 to 2 tight sentences.
- Include high-level proof points if available (user counts, time saved, measurable outcomes).
- Link to social proof page if provided.
- End with a soft CTA like "Mind if I send over more details?" or "Open to exploring this?" or "Would love to offer access and chat about it."
- Do NOT include the calendar link in the initial email.
- Length: 120 to 150 words.

FOLLOW-UP 1 (+3 days):
- Different angle or tighter framing of value
- Keep it short, 50 to 80 words
- Reinforce one key outcome
- End with "Open to a quick chat?" or similar
- No calendar link yet.

FOLLOW-UP 2 (+4 days):
- Brief and final, 50 to 80 words
- Respectful tone
- Include the calendar link if provided.

NEVER DO THESE:
- "I hope this finds you well", "I'm reaching out from", "I represent"
- Em dashes (— or --) anywhere in the text. NEVER use them.
- "exciting", "thrilled", "empower", "streamline", "leverage"
- "{{company_name}}" variable (doesn't exist)
- Generic flattery that doesn't match the persona
- Generic praise that does not match their role
- Long run-on paragraphs
- Over-sharing internal metrics
- Using more than one personalization variable

Your job is to write founder-led outbound that feels researched, credible, grounded, and aligned with real customer outcomes.`;

/**
 * Generate a complete email sequence (initial + follow-ups)
 */
export async function generateEmailSequence(params: GenerateEmailParams): Promise<GeneratedEmailSequence> {
  const openai = getOpenAIClient();

  const cta = params.callToAction || 'a quick chat';
  const numFollowUps = Math.min(Math.max((params.sequenceLength ?? 2) - 1, 0), 2);

  const basePrompt = params.customPrompt || DEFAULT_EMAIL_PROMPT;

  const calendarNote = `\nIMPORTANT: The LAST follow-up email in the sequence MUST include the calendar link. If there's only 1 follow-up, that follow-up must have the calendar link.`;

  const jsonInstruction = numFollowUps === 0
    ? `\n\nReturn ONLY the initial email as JSON:\n{ "initial": { "subject": "...", "body": "..." } }`
    : numFollowUps === 1
    ? `${calendarNote}\n\nReturn JSON with initial + 1 follow-up (include calendar link in followUp1):\n{ "initial": { "subject": "...", "body": "..." }, "followUp1": { "subject": "", "body": "...", "delayDays": 3 } }`
    : `${calendarNote}\n\nReturn JSON with initial + 2 follow-ups (include calendar link in followUp2):\n{ "initial": { "subject": "...", "body": "..." }, "followUp1": { "subject": "", "body": "...", "delayDays": 3 }, "followUp2": { "subject": "", "body": "...", "delayDays": 4 } }`;

  const systemPrompt = basePrompt + jsonInstruction;

  const userPrompt = `Write a ${numFollowUps + 1}-email outreach sequence.

Sender: ${params.companyName}
Product: ${params.companyDescription}
Value: ${params.valueProposition}
Persona: ${params.targetPersona}
CTA: ${cta}

Remember: the opener must be specifically relevant to this persona type. Not generic.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return EmailSequenceSchema.parse(JSON.parse(content)) as GeneratedEmailSequence;
}

/**
 * Generate a single personalized email for a specific lead
 */
export async function generatePersonalizedEmail(params: {
  templateSubject: string;
  templateBody: string;
  leadName: string;
  leadCompany?: string;
  leadContext?: string; // e.g., "TikTok creator with 15k followers in fitness niche"
}): Promise<{ subject: string; body: string }> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are personalizing a cold email template for a specific lead.
Keep the core message but adapt it to feel more personal and relevant.
Only make subtle changes - don't rewrite the entire email.
Return JSON: { "subject": "...", "body": "..." }`;

  const userPrompt = `Template Subject: ${params.templateSubject}
Template Body: ${params.templateBody}

Lead Name: ${params.leadName}
Lead Company: ${params.leadCompany || 'Unknown'}
Lead Context: ${params.leadContext || 'No additional context'}

Personalize this email while keeping the core message intact.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.6,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return JSON.parse(content);
}

/**
 * Rewrite campaign emails based on user instructions + optional lead context
 */
export async function rewriteCampaignEmails(params: {
  emails: Array<{ step: number; subject: string; body: string }>;
  instructions: string;
  leadContext?: { name?: string; bio?: string; title?: string; url?: string; expertise?: string[]; platform?: string } | null;
  companyContext?: { name: string; description: string } | null;
  customPrompt?: string | null;
}): Promise<Array<{ step: number; subject: string; body: string }>> {
  const openai = getOpenAIClient();

  const baseRules = params.customPrompt || DEFAULT_EMAIL_PROMPT;

  const currentEmails = params.emails.map(e =>
    `--- Step ${e.step} ---\nSubject: ${e.subject}\nBody:\n${e.body}`
  ).join('\n\n');

  let leadSection = '';
  if (params.leadContext) {
    const lc = params.leadContext;
    leadSection = `\n\nLEAD CONTEXT (use this to personalize if the instructions ask for it):
Name: ${lc.name || 'Unknown'}
Title: ${lc.title || ''}
Bio: ${lc.bio || ''}
Platform: ${lc.platform || ''}
URL: ${lc.url || ''}
Expertise: ${lc.expertise?.join(', ') || ''}`;
  }

  const systemPrompt = `${baseRules}

You are editing an existing email sequence. Apply the user's instructions to rewrite the emails.
Keep the same number of emails. Preserve the step numbers.
Follow-up subjects should be "" (empty string) so they thread.
${params.companyContext ? `\nCompany: ${params.companyContext.name}\nProduct: ${params.companyContext.description}` : ''}${leadSection}

Return JSON array: [{ "step": 0, "subject": "...", "body": "..." }, ...]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `CURRENT EMAILS:\n${currentEmails}\n\nINSTRUCTIONS:\n${params.instructions}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  const parsed = JSON.parse(content);
  let emails: any[];
  if (Array.isArray(parsed)) {
    emails = parsed;
  } else {
    // json_object wraps in an object — find the first array value
    const arrayVal = Object.values(parsed).find(v => Array.isArray(v)) as any[] | undefined;
    emails = arrayVal || [];
  }
  if (emails.length === 0) throw new Error('AI returned no emails');
  return emails.map((e: any, i: number) => ({ step: e.step ?? i, subject: e.subject || '', body: e.body }));
}

/**
 * Improve email copy based on performance data
 */
export async function improveEmailCopy(params: {
  originalSubject: string;
  originalBody: string;
  openRate: number;
  replyRate: number;
  feedback?: string;
}): Promise<{ subject: string; body: string; changes: string[] }> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a cold email optimization expert.
Based on the performance data, suggest improvements to the email.

Return JSON:
{
  "subject": "improved subject",
  "body": "improved body",
  "changes": ["change 1", "change 2"]
}`;

  const userPrompt = `Original Subject: ${params.originalSubject}
Original Body: ${params.originalBody}

Performance:
- Open Rate: ${(params.openRate * 100).toFixed(1)}%
- Reply Rate: ${(params.replyRate * 100).toFixed(1)}%

${params.feedback ? `Feedback: ${params.feedback}` : ''}

${params.openRate < 0.3 ? 'Focus on improving the subject line to boost opens.' : ''}
${params.replyRate < 0.05 ? 'Focus on making the CTA clearer and the value prop stronger.' : ''}

Suggest improvements.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return JSON.parse(content);
}
