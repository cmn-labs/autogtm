import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; promptId: string }> }
) {
  try {
    const { id: companyId, promptId } = await params;
    const { name, content, is_archived } = await request.json() as {
      name?: string;
      content?: string;
      is_archived?: boolean;
    };

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Prompt name cannot be empty' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (content !== undefined) {
      if (!content || typeof content !== 'string' || !content.trim()) {
        return NextResponse.json({ error: 'Prompt content cannot be empty' }, { status: 400 });
      }
      if (content.length > 12000) {
        return NextResponse.json({ error: 'Prompt content is too long' }, { status: 400 });
      }
      updateData.content = content.trim();
    }
    if (is_archived !== undefined) updateData.is_archived = is_archived;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: prompt, error } = await supabase
      .from('outreach_prompts')
      .update(updateData)
      .eq('id', promptId)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error updating outreach prompt:', error);
    return NextResponse.json({ error: 'Failed to update outreach prompt' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; promptId: string }> }
) {
  try {
    const { id: companyId, promptId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('outreach_prompts')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promptId)
      .eq('company_id', companyId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting outreach prompt:', error);
    return NextResponse.json({ error: 'Failed to delete outreach prompt' }, { status: 500 });
  }
}
