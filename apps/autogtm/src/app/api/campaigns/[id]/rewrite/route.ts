import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rewriteCampaignEmails } from '@autogtm/core/ai/generateEmailCopy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { instructions, leadContext } = await request.json() as {
      instructions: string;
      leadContext?: { name?: string; bio?: string; title?: string; url?: string; expertise?: string[]; platform?: string } | null;
    };

    if (!instructions?.trim()) {
      return NextResponse.json({ error: 'Instructions required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: emails } = await supabase
      .from('campaign_emails')
      .select('step, subject, body')
      .eq('campaign_id', id)
      .order('step', { ascending: true });

    if (!emails?.length) {
      return NextResponse.json({ error: 'No emails found for campaign' }, { status: 404 });
    }

    // Get company context
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('company_id')
      .eq('id', id)
      .single();

    let companyContext = null;
    if (campaign?.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('name, description, email_prompt')
        .eq('id', campaign.company_id)
        .single();
      if (company) {
        companyContext = { name: company.name, description: company.description };
      }
    }

    console.log(`[rewrite] Campaign ${id} | instructions: "${instructions}" | emails: ${emails.length} | lead: ${leadContext?.name || 'none'}`);

    let rewritten;
    try {
      rewritten = await rewriteCampaignEmails({
        emails,
        instructions,
        leadContext: leadContext || null,
        companyContext,
      });
    } catch (aiError: any) {
      console.error(`[rewrite] AI error:`, aiError.message, aiError.stack);
      return NextResponse.json({ error: `AI error: ${aiError.message}` }, { status: 500 });
    }

    console.log(`[rewrite] Success: ${rewritten.length} emails returned`);
    return NextResponse.json({ emails: rewritten });
  } catch (error: any) {
    console.error(`[rewrite] Unexpected error:`, error.message, error.stack);
    return NextResponse.json({ error: error.message || 'Failed to rewrite' }, { status: 500 });
  }
}
