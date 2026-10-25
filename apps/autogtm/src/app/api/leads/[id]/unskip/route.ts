import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** Skip reasons written by the Precleared compliance check start with this. */
const PRECLEARED_SKIP_PREFIX = 'Precleared:';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if lead has enrichment data to fix stuck enrichment_status
    const { data: lead } = await supabase
      .from('leads')
      .select('enrichment_status, promotion_fit_score, skip_reason, suggested_campaign_id')
      .eq('id', leadId)
      .single();

    const updateData: Record<string, any> = {
      campaign_status: 'pending',
      skip_reason: null,
    };

    // A lead the Precleared check held back keeps its suggested campaign, so Undo
    // puts it straight back in Ready to Add and the next run checks it again
    // (with the settings as they are now). Any other skip drops the suggestion
    // as before.
    const heldByPrecleared = (lead?.skip_reason || '').startsWith(PRECLEARED_SKIP_PREFIX) && !!lead?.suggested_campaign_id;
    if (!heldByPrecleared) {
      updateData.suggested_campaign_id = null;
      updateData.suggested_campaign_reason = null;
    }

    // Fix stuck enriching status if lead already has enrichment data
    if (lead?.enrichment_status === 'enriching' && lead?.promotion_fit_score) {
      updateData.enrichment_status = 'enriched';
    }

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId);

    if (error) throw error;

    return NextResponse.json({ success: true, kept_suggested_campaign: heldByPrecleared });
  } catch (error) {
    console.error('Error unskipping lead:', error);
    return NextResponse.json({ error: 'Failed to unskip lead' }, { status: 500 });
  }
}
