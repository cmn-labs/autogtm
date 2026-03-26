import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateCampaignSequences } from '@autogtm/core/clients/instantly';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: emails, error } = await supabase
      .from('campaign_emails')
      .select('*')
      .eq('campaign_id', id)
      .order('step', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ emails: emails || [] });
  } catch (error) {
    console.error('Error fetching campaign emails:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign emails' }, { status: 500 });
  }
}

function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map(para => `<div>${para.replace(/\n/g, '<br>')}</div>`)
    .join('<div><br></div>');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { emails } = await request.json() as {
      emails: Array<{ step: number; subject: string; body: string }>;
    };

    if (!emails?.length) {
      return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('instantly_campaign_id')
      .eq('id', id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Update DB
    for (const email of emails) {
      await supabase
        .from('campaign_emails')
        .update({ subject: email.subject, body: email.body })
        .eq('campaign_id', id)
        .eq('step', email.step);
    }

    // Update Instantly
    const { data: allEmails } = await supabase
      .from('campaign_emails')
      .select('*')
      .eq('campaign_id', id)
      .order('step', { ascending: true });

    if (allEmails && allEmails.length > 0) {
      await updateCampaignSequences(
        campaign.instantly_campaign_id,
        allEmails.map((e, i) => ({
          subject: e.subject,
          body: textToHtml(e.body),
          delayMinutes: i === 0 ? 0 : (e.delay_days || 3) * 24 * 60,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving campaign emails:', error);
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 500 });
  }
}
