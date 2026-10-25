import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRECLEARED_SENDER_COUNTRIES = ['GB', 'US', 'AE'];
const PRECLEARED_ADDRESS_SOURCES = ['published', 'bought', 'scraped', 'given', 'unknown'];

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

    // Precleared compliance check settings (optional, off by default)
    if (body.precleared_enabled !== undefined) {
      if (typeof body.precleared_enabled !== 'boolean') {
        return NextResponse.json({ error: 'precleared_enabled must be true or false' }, { status: 400 });
      }
      updateData.precleared_enabled = body.precleared_enabled;
      // Switching the check off ends any hold it recorded.
      if (!body.precleared_enabled) updateData.precleared_last_hold = null;
    }
    if (body.precleared_sender_country !== undefined) {
      if (!PRECLEARED_SENDER_COUNTRIES.includes(body.precleared_sender_country)) {
        return NextResponse.json({ error: `precleared_sender_country must be one of ${PRECLEARED_SENDER_COUNTRIES.join(', ')}` }, { status: 400 });
      }
      updateData.precleared_sender_country = body.precleared_sender_country;
    }
    if (body.precleared_address_source !== undefined) {
      if (!PRECLEARED_ADDRESS_SOURCES.includes(body.precleared_address_source)) {
        return NextResponse.json({ error: `precleared_address_source must be one of ${PRECLEARED_ADDRESS_SOURCES.join(', ')}` }, { status: 400 });
      }
      updateData.precleared_address_source = body.precleared_address_source;
    }
    if (body.precleared_prospect_country !== undefined) {
      const raw = body.precleared_prospect_country;
      const code = typeof raw === 'string' ? raw.trim().toUpperCase() : raw;
      if (code === null || code === '') {
        updateData.precleared_prospect_country = null;
      } else if (typeof code === 'string' && /^[A-Z]{2}$/.test(code)) {
        updateData.precleared_prospect_country = code;
      } else {
        return NextResponse.json({ error: 'precleared_prospect_country must be a two-letter country code or empty' }, { status: 400 });
      }
    }

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
