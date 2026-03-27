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

function stripForbiddenDashes(text: string): string {
  return text
    .replace(/—/g, ',')
    .replace(/--/g, ',');
}

function sanitizeSequence(sequence: GeneratedEmailSequence): GeneratedEmailSequence {
  return {
    initial: {
      subject: stripForbiddenDashes(sequence.initial.subject),
      body: stripForbiddenDashes(sequence.initial.body),
    },
    followUp1: {
      subject: stripForbiddenDashes(sequence.followUp1.subject),
      body: stripForbiddenDashes(sequence.followUp1.body),
      delayDays: sequence.followUp1.delayDays,
    },
    followUp2: sequence.followUp2
      ? {
          subject: stripForbiddenDashes(sequence.followUp2.subject),
          body: stripForbiddenDashes(sequence.followUp2.body),
          delayDays: sequence.followUp2.delayDays,
        }
      : undefined,
  };
}

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

export const DEFAULT_EMAIL_PROMPT = `You write cold outbound email sequences for founders.

Write like a real human founder, not a sales rep. Keep it natural, concise, conversational, and partnership-first.

Core style:
- Friendly but professional
- Direct and clear
- Short paragraphs (1 to 3 sentences)
- Personalized opener using the lead/persona context provided
- Sound like one person writing to another person
- Slightly warm and approachable; avoid stiff, robotic phrasing
- Slightly flowing sentences are OK; avoid choppy one-liner stacks

Hard rules:
- Use {{firstName}} as the only variable
- Plain text only, no HTML, no bullets in email bodies
- Follow-up subjects must be ""
- No em dashes (— or --)
- No corporate jargon or hype language
- Do not fabricate specific content titles, episodes, or posts
- Do not mention ARR, fundraising, valuation, or internal finance metrics

Sequence expectations:
- Initial email: around 120 to 180 words, clear opener + founder intro + plain-English product explanation + one concise proof block + soft partnership CTA
- Do not include calendar link in initial email unless explicitly requested by product context
- Follow-up 1: around 45 to 80 words, new angle, no calendar link
- Follow-up 2: around 45 to 70 words, brief/respectful, include calendar link when provided

Personalization guidance:
- If lead-specific context is provided (bio/category/platform/expertise), use it in the opener in a grounded way
- Reference type of work, not invented specifics
- Keep the message targeted to this lead's world
- Preferred opener pattern:
  - Start: Hey {{firstName}}, (or Hey {{firstName}}! when it feels natural)
  - Then a natural line such as "Came across your work around..." or "Saw your work in..."
  - Keep the first 2 lines conversational before pitching

Tone and close:
- Keep the final ask low-pressure and friendly
- Avoid menu-like "options include..." phrasing unless needed
- Close naturally with sender name, no template-y language.`;

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

Remember:
- The opener must be specifically relevant to this persona/lead context. Not generic.
- If persona includes lead bio/category/platform details, incorporate them naturally in line 1.
- Keep tone human and conversational, not polished AI copy.`;

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

  const parsed = EmailSequenceSchema.parse(JSON.parse(content)) as GeneratedEmailSequence;
  return sanitizeSequence(parsed);
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

/**
 * Regenerate an entire sequence using existing copy + user feedback.
 * Returns a proposed sequence only; caller decides whether to persist.
 */
export async function regenerateEmailSequenceWithFeedback(params: {
  companyName: string;
  companyDescription: string;
  valueProposition: string;
  targetPersona: string;
  existingSequence: Array<{ step: number; subject: string; body: string; delay_days: number }>;
  feedback: string;
  sequenceLength?: number;
  customPrompt?: string | null;
}): Promise<GeneratedEmailSequence> {
  const openai = getOpenAIClient();
  const numFollowUps = Math.min(Math.max((params.sequenceLength ?? 2) - 1, 0), 2);
  const basePrompt = params.customPrompt || DEFAULT_EMAIL_PROMPT;

  const jsonInstruction = numFollowUps === 1
    ? `\n\nReturn JSON with initial + 1 follow-up:\n{ "initial": { "subject": "...", "body": "..." }, "followUp1": { "subject": "", "body": "...", "delayDays": 3 } }`
    : `\n\nReturn JSON with initial + 2 follow-ups:\n{ "initial": { "subject": "...", "body": "..." }, "followUp1": { "subject": "", "body": "...", "delayDays": 3 }, "followUp2": { "subject": "", "body": "...", "delayDays": 4 } }`;

  const systemPrompt = `${basePrompt}

You are revising an existing draft sequence based on explicit user feedback.
- Preserve what is already strong.
- Apply the feedback directly and concretely.
- Keep the same number of emails as requested.
- Keep delays practical: followUp1 around 3 days, followUp2 around 4 days.
- Return only valid JSON.${jsonInstruction}`;

  const userPrompt = `Regenerate this sequence draft.

Sender: ${params.companyName}
Product: ${params.companyDescription}
Value: ${params.valueProposition}
Persona: ${params.targetPersona}

Existing sequence:
${JSON.stringify(params.existingSequence, null, 2)}

User feedback:
${params.feedback || 'Improve clarity and make it more personalized.'}

Rewrite the sequence accordingly while keeping it founder-led and grounded.`;

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

  const parsed = EmailSequenceSchema.parse(JSON.parse(content)) as GeneratedEmailSequence;
  return sanitizeSequence(parsed);
}
