import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { inngest } from '@/inngest/client';

/**
 * Manually trigger the Autopilot sweep for a single company.
 * Fires `autogtm/auto-add.sweep-company` with trigger: 'manual'.
 * Respects the company's current preferences (limit, min_fit_score) — but
 * does NOT require `auto_add_enabled` to be true (useful for dry-run / first run).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: company, error } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const result = await inngest.send({
      name: 'autogtm/auto-add.sweep-company',
      data: { companyId, trigger: 'manual' },
    });

    return NextResponse.json({ success: true, eventIds: result.ids });
  } catch (error) {
    console.error('Error triggering auto-add sweep:', error);
    return NextResponse.json(
      { error: 'Failed to trigger auto-add sweep' },
      { status: 500 }
    );
  }
}
