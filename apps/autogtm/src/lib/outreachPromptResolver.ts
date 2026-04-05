type SupabaseClientLike = {
  from: (table: string) => any;
};

export async function resolveInstructionPromptOverride(
  supabase: SupabaseClientLike,
  companyId: string,
  sourceInstructionId: string | null | undefined
): Promise<string | null> {
  if (!sourceInstructionId) return null;

  const { data: instruction } = await supabase
    .from('company_updates')
    .select('outreach_prompt_snapshot, outreach_prompt_id')
    .eq('id', sourceInstructionId)
    .eq('company_id', companyId)
    .single();

  if (!instruction) return null;
  if (instruction.outreach_prompt_snapshot) return instruction.outreach_prompt_snapshot;
  if (!instruction.outreach_prompt_id) return null;

  const { data: prompt } = await supabase
    .from('outreach_prompts')
    .select('content, is_archived')
    .eq('id', instruction.outreach_prompt_id)
    .eq('company_id', companyId)
    .single();

  if (!prompt || prompt.is_archived) return null;
  return prompt.content || null;
}

export async function resolveOutreachPromptForLead(params: {
  supabase: SupabaseClientLike;
  companyId: string;
  leadId: string;
  companyEmailPrompt?: string | null;
}): Promise<{ prompt: string | null; source: 'instruction_override' | 'company' | 'default' }> {
  const { supabase, companyId, leadId, companyEmailPrompt } = params;

  const { data: leadRow } = await supabase
    .from('leads')
    .select('id, exa_queries!inner(source_instruction_id, company_id)')
    .eq('id', leadId)
    .eq('exa_queries.company_id', companyId)
    .single();

  const sourceInstructionId = (leadRow?.exa_queries as any)?.source_instruction_id as string | null | undefined;
  const instructionPrompt = await resolveInstructionPromptOverride(supabase, companyId, sourceInstructionId);
  if (instructionPrompt) {
    return { prompt: instructionPrompt, source: 'instruction_override' };
  }
  if (companyEmailPrompt) {
    return { prompt: companyEmailPrompt, source: 'company' };
  }
  return { prompt: null, source: 'default' };
}
