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

    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.website !== undefined) updateData.website = body.website;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.target_audience !== undefined) updateData.target_audience = body.target_audience;
    if (body.sending_emails !== undefined) updateData.sending_emails = body.sending_emails;
    if (body.default_sequence_length !== undefined) updateData.default_sequence_length = body.default_sequence_length;
    if (body.email_prompt !== undefined) updateData.email_prompt = body.email_prompt;
    if (body.auto_add_enabled !== undefined) updateData.auto_add_enabled = body.auto_add_enabled;
    if (body.auto_add_min_fit_score !== undefined) updateData.auto_add_min_fit_score = body.auto_add_min_fit_score;
    if (body.auto_add_daily_limit !== undefined) updateData.auto_add_daily_limit = body.auto_add_daily_limit;
    if (body.auto_add_run_hour_utc !== undefined) updateData.auto_add_run_hour_utc = body.auto_add_run_hour_utc;
    if (body.auto_add_digest_email !== undefined) updateData.auto_add_digest_email = body.auto_add_digest_email;
    if (body.auto_add_regenerate_drafts !== undefined) updateData.auto_add_regenerate_drafts = body.auto_add_regenerate_drafts;
    if (body.system_enabled !== undefined) updateData.system_enabled = body.system_enabled;

    const { data: company, error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Failed to update company' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete company (cascades to queries, leads, campaigns via FK)
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    return NextResponse.json(
      { error: 'Failed to delete company' },
      { status: 500 }
    );
  }
}
