import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: prompts, error } = await supabase
      .from('outreach_prompts')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ prompts: prompts || [] });
  } catch (error) {
    console.error('Error fetching outreach prompts:', error);
    return NextResponse.json({ error: 'Failed to fetch outreach prompts' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { name, content } = await request.json() as { name?: string; content?: string };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Prompt name is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Prompt content is required' }, { status: 400 });
    }
    if (content.length > 12000) {
      return NextResponse.json({ error: 'Prompt content is too long' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: prompt, error } = await supabase
      .from('outreach_prompts')
      .insert({
        company_id: companyId,
        name: name.trim(),
        content: content.trim(),
        is_archived: false,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error creating outreach prompt:', error);
    return NextResponse.json({ error: 'Failed to create outreach prompt' }, { status: 500 });
  }
}
