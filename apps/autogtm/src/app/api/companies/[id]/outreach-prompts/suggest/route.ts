import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { DEFAULT_EMAIL_PROMPT } from '@autogtm/core/ai/generateEmailCopy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { instructionContent, basePromptId } = await request.json() as {
      instructionContent?: string;
      basePromptId?: string | null;
    };

    if (!instructionContent || typeof instructionContent !== 'string' || !instructionContent.trim()) {
      return NextResponse.json({ error: 'instructionContent is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let basePrompt = DEFAULT_EMAIL_PROMPT;
    if (basePromptId) {
      const { data: prompt, error } = await supabase
        .from('outreach_prompts')
        .select('content')
        .eq('id', basePromptId)
        .eq('company_id', companyId)
        .eq('is_archived', false)
        .single();
      if (error || !prompt) {
        return NextResponse.json({ error: 'Invalid basePromptId' }, { status: 400 });
      }
      basePrompt = prompt.content;
    } else {
      // Prefer the company's tuned email_prompt (founder name, signature, structure)
      // over the generic DEFAULT_EMAIL_PROMPT. Falls back to default if unset.
      const { data: company } = await supabase
        .from('companies')
        .select('email_prompt')
        .eq('id', companyId)
        .single();
      if (company?.email_prompt?.trim()) {
        basePrompt = company.email_prompt;
      }
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: `You are editing a cold outreach system prompt for a very specific outreach flavor.

Base prompt:
${basePrompt}

Instruction flavor:
${instructionContent.trim()}

Task:
- Keep all structural constraints and safety rules from the base prompt.
- Adapt targeting, examples, and phrasing guidance so this prompt works better for this instruction flavor.
- Keep output as plain prompt text only.
- Do not include markdown fences.
- Do not mention these instructions.`,
    });

    const suggestedPrompt = response.output_text?.trim();
    if (!suggestedPrompt) {
      throw new Error('No suggestion generated');
    }

    console.log('[prompt-suggestion] generated', { companyId, source: basePromptId ? 'preset' : 'default' });
    return NextResponse.json({ prompt: suggestedPrompt });
  } catch (error) {
    console.error('Error generating outreach prompt suggestion:', error);
    return NextResponse.json({ error: 'Failed to generate outreach prompt suggestion' }, { status: 500 });
  }
}
