import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { inngest } from '@/inngest/client';
import { startQueryRun } from '../../../queries/_lib/startQueryRun';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    const { data: updates, error } = await supabase
      .from('company_updates')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ updates: updates || [] });
  } catch (error) {
    console.error('Error fetching updates:', error);
    return NextResponse.json({ error: 'Failed to fetch updates' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { content, mode } = await request.json() as { content?: string; mode?: 'queue' | 'run_now' };

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('company_updates')
      .insert({ company_id: companyId, content })
      .select()
      .single();

    if (error) throw error;

    if (mode !== 'run_now') {
      return NextResponse.json({ update: data, mode: 'queue' });
    }

    await inngest.send({
      name: 'autogtm/queries.generate-for-instruction',
      data: { companyId, instructionId: data.id },
    });

    let queryId: string | null = null;
    for (let i = 0; i < 15; i++) {
      const { data: generatedQuery } = await supabase
        .from('exa_queries')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('source_instruction_id', data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (generatedQuery?.id) {
        queryId = generatedQuery.id;
        if (generatedQuery.status === 'running' || generatedQuery.status === 'completed') {
          return NextResponse.json({
            update: data,
            mode: 'run_now',
            run_now: {
              query_id: queryId,
              status: generatedQuery.status,
              started: true,
            },
          });
        }
        break;
      }

      await sleep(1000);
    }

    if (!queryId) {
      return NextResponse.json({
        update: data,
        mode: 'run_now',
        run_now: {
          started: false,
          reason: 'query_not_ready',
        },
      }, { status: 202 });
    }

    const started = await startQueryRun(supabase, queryId);

    return NextResponse.json({
      update: data,
      mode: 'run_now',
      run_now: {
        query_id: queryId,
        status: started.status,
        started: true,
        webset_id: started.websetId,
      },
    });
  } catch (error) {
    console.error('Error creating update:', error);
    return NextResponse.json({ error: 'Failed to create update' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const updateId = searchParams.get('update_id');

    if (!updateId) {
      return NextResponse.json({ error: 'update_id is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('company_updates')
      .delete()
      .eq('id', updateId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting update:', error);
    return NextResponse.json({ error: 'Failed to delete update' }, { status: 500 });
  }
}
