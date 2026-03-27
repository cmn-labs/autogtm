import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { startQueryRun } from '../../_lib/startQueryRun';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: queryId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await startQueryRun(supabase, queryId);

    return NextResponse.json({
      success: true,
      websetId: result.websetId,
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Query not found') {
      return NextResponse.json({ error: 'Query not found' }, { status: 404 });
    }
    console.error('Error running query:', error);
    return NextResponse.json(
      { error: 'Failed to run query' },
      { status: 500 }
    );
  }
}
