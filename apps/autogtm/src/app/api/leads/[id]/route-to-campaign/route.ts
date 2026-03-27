import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { inngest } from '@/inngest/client';

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

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, email, suggested_campaign_id, campaign_status, enrichment_status')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 });
    }

    if (lead.campaign_status === 'routed') {
      return NextResponse.json({ error: 'Lead is already in a campaign' }, { status: 400 });
    }

    if (!lead.suggested_campaign_id) {
      return NextResponse.json({ error: 'No campaign suggested for this lead yet' }, { status: 400 });
    }

    // Trigger the add-to-campaign job
    await inngest.send({
      name: 'autogtm/lead.add-to-campaign',
      data: {
        leadId: lead.id,
        campaignId: lead.suggested_campaign_id,
      },
    });

    return NextResponse.json({ success: true, message: 'Sending lead campaign' });
  } catch (error) {
    console.error('Error adding lead to campaign:', error);
    return NextResponse.json(
      { error: 'Failed to add lead to campaign' },
      { status: 500 }
    );
  }
}
