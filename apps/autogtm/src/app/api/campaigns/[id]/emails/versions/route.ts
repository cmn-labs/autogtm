import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const { count, error } = await supabase
      .from('campaign_email_versions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id);
    if (error) throw error;

    return NextResponse.json({ undo_available: (count || 0) > 0, versions_count: count || 0 });
  } catch (error) {
    console.error('Error fetching campaign email versions:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign email versions' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .single();
    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be undone' }, { status: 400 });
    }

    const { data: latestRows, error: latestError } = await supabase
      .from('campaign_email_versions')
      .select('version_number')
      .eq('campaign_id', id)
      .order('version_number', { ascending: false })
      .limit(1);
    if (latestError) throw latestError;

    const latestVersion = latestRows?.[0]?.version_number;
    if (!latestVersion) {
      return NextResponse.json({ error: 'No previous saved version available' }, { status: 400 });
    }

    const { data: versionEmails, error: versionEmailsError } = await supabase
      .from('campaign_email_versions')
      .select('step, subject, body, delay_days')
      .eq('campaign_id', id)
      .eq('version_number', latestVersion)
      .order('step', { ascending: true });
    if (versionEmailsError) throw versionEmailsError;

    if (!versionEmails || versionEmails.length === 0) {
      return NextResponse.json({ error: 'Version data is empty' }, { status: 400 });
    }

    const { error: deleteCurrentError } = await supabase
      .from('campaign_emails')
      .delete()
      .eq('campaign_id', id);
    if (deleteCurrentError) throw deleteCurrentError;

    const { data: restoredEmails, error: restoreError } = await supabase
      .from('campaign_emails')
      .insert(
        versionEmails.map((email) => ({
          campaign_id: id,
          step: email.step,
          subject: email.subject,
          body: email.body,
          delay_days: email.delay_days,
          updated_at: new Date().toISOString(),
        }))
      )
      .select('*')
      .order('step', { ascending: true });
    if (restoreError) throw restoreError;

    const { error: deleteVersionError } = await supabase
      .from('campaign_email_versions')
      .delete()
      .eq('campaign_id', id)
      .eq('version_number', latestVersion);
    if (deleteVersionError) throw deleteVersionError;

    const { count: remainingCount, error: countError } = await supabase
      .from('campaign_email_versions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id);
    if (countError) throw countError;

    return NextResponse.json({
      emails: restoredEmails || [],
      undo_available: (remainingCount || 0) > 0,
      versions_count: remainingCount || 0,
    });
  } catch (error) {
    console.error('Error undoing campaign email version:', error);
    return NextResponse.json({ error: 'Failed to undo campaign email version' }, { status: 500 });
  }
}
