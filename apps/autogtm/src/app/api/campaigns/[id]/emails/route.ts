import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const CampaignStepInputSchema = z.object({
  step: z.number().int().min(0).max(2),
  subject: z.string().min(1),
  body: z.string().min(1),
  delay_days: z.number().int().min(0),
});

const CampaignSequenceInputSchema = z.array(CampaignStepInputSchema).min(1).max(3);

async function createVersionSnapshot(
  supabase: any,
  campaignId: string
): Promise<void> {
  const { data: currentEmails, error: fetchError } = await supabase
    .from('campaign_emails')
    .select('step, subject, body, delay_days')
    .eq('campaign_id', campaignId)
    .order('step', { ascending: true });
  if (fetchError) throw fetchError;

  if (!currentEmails || currentEmails.length === 0) return;

  const { data: latestVersionRows, error: versionError } = await supabase
    .from('campaign_email_versions')
    .select('version_number')
    .eq('campaign_id', campaignId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (versionError) throw versionError;

  const nextVersion = ((latestVersionRows as any[])?.[0]?.version_number || 0) + 1;

  const { error: insertVersionError } = await supabase
    .from('campaign_email_versions')
    .insert(
      (currentEmails as any[]).map((email) => ({
        campaign_id: campaignId,
        version_number: nextVersion,
        step: email.step,
        subject: email.subject,
        body: email.body,
        delay_days: email.delay_days,
      }))
    );
  if (insertVersionError) throw insertVersionError;
}

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const sequence = CampaignSequenceInputSchema.parse(payload?.emails || []);

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
      return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 400 });
    }

    const uniqueSteps = new Set(sequence.map((email) => email.step));
    if (uniqueSteps.size !== sequence.length) {
      return NextResponse.json({ error: 'Duplicate step values are not allowed' }, { status: 400 });
    }

    await createVersionSnapshot(supabase, id);

    const { error: deleteError } = await supabase
      .from('campaign_emails')
      .delete()
      .eq('campaign_id', id);
    if (deleteError) throw deleteError;

    const { data: emails, error } = await supabase
      .from('campaign_emails')
      .insert(sequence.map((email) => ({
        campaign_id: id,
        step: email.step,
        subject: email.subject,
        body: email.body,
        delay_days: email.delay_days,
        updated_at: new Date().toISOString(),
      })))
      .select('*')
      .order('step', { ascending: true });

    if (error) throw error;

    const { count: versionCount, error: countError } = await supabase
      .from('campaign_email_versions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id);
    if (countError) throw countError;

    return NextResponse.json({
      emails: emails || [],
      undo_available: (versionCount || 0) > 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid email sequence payload' }, { status: 400 });
    }
    console.error('Error updating campaign emails:', error);
    return NextResponse.json({ error: 'Failed to update campaign emails' }, { status: 500 });
  }
}
