/**
 * Database operations for AutoGTM
 * Uses Supabase as the data store
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Company,
  ExaQuery,
  WebsetRun,
  Lead,
  Campaign,
  CampaignWithStats,
  CampaignEmail,
  DailyDigest,
  AllowedUser,
} from '../types';
import { getCampaignAnalytics } from '../clients/instantly';

let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const url = process.env.AUTOGTM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.AUTOGTM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase credentials are required');
    }
    
    _supabaseClient = createClient(url, key);
  }
  return _supabaseClient;
}

// ============ Companies ============

export async function createCompany(company: Omit<Company, 'id' | 'created_at' | 'updated_at'>): Promise<Company> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('companies')
    .insert(company)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('companies')
    .select()
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function listCompanies(): Promise<Company[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('companies')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateCompany(id: string, updates: Partial<Company>): Promise<Company> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Exa Queries ============

export async function createExaQuery(query: Omit<ExaQuery, 'id' | 'created_at' | 'updated_at'>): Promise<ExaQuery> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('exa_queries')
    .insert(query)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getExaQueriesForCompany(companyId: string): Promise<ExaQuery[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('exa_queries')
    .select()
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getActiveExaQueries(): Promise<ExaQuery[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('exa_queries')
    .select()
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateExaQuery(id: string, updates: Partial<ExaQuery>): Promise<ExaQuery> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('exa_queries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteExaQuery(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('exa_queries')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============ Webset Runs ============

export async function createWebsetRun(run: Omit<WebsetRun, 'id'>): Promise<WebsetRun> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('webset_runs')
    .insert(run)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWebsetRun(id: string, updates: Partial<WebsetRun>): Promise<WebsetRun> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('webset_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestWebsetRun(queryId: string): Promise<WebsetRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('webset_runs')
    .select()
    .eq('query_id', queryId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ============ Leads ============

export async function createLead(lead: Omit<Lead, 'id' | 'created_at'>): Promise<Lead> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createLeads(leads: Omit<Lead, 'id' | 'created_at'>[]): Promise<Lead[]> {
  if (leads.length === 0) return [];
  
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .insert(leads)
    .select();

  if (error) throw error;
  return data || [];
}

export async function getLeadsForQuery(queryId: string): Promise<Lead[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select()
    .eq('query_id', queryId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getLeadsWithEmails(queryId: string): Promise<Lead[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select()
    .eq('query_id', queryId)
    .not('email', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function checkLeadExists(url: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .eq('url', url)
    .limit(1);

  if (error) throw error;
  return (data?.length || 0) > 0;
}

export async function getLeadsByDateRange(startDate: string, endDate: string): Promise<Lead[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select()
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============ Campaigns ============

export async function createCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select()
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function listCampaigns(companyId: string): Promise<Campaign[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select()
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateCampaignStats(
  id: string,
  stats: { emails_sent?: number; opens?: number; replies?: number }
): Promise<Campaign> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaigns')
    .update({ ...stats, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveCampaignsForCompany(companyId: string): Promise<Campaign[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select()
    .eq('company_id', companyId)
    .in('status', ['active', 'draft'])
    .eq('is_accepting_leads', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getCampaignsWithStats(companyId: string): Promise<CampaignWithStats[]> {
  const campaigns = await getActiveCampaignsForCompany(companyId);

  return Promise.all(
    campaigns.map(async (c) => {
      try {
        const analytics = await getCampaignAnalytics(c.instantly_campaign_id);
        return {
          ...c,
          open_rate: analytics.sent > 0 ? analytics.opened / analytics.sent : 0,
          reply_rate: analytics.sent > 0 ? analytics.replied / analytics.sent : 0,
        };
      } catch {
        return { ...c, open_rate: 0, reply_rate: 0 };
      }
    })
  );
}

export async function incrementCampaignLeadCount(campaignId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('increment_campaign_leads', { campaign_id_input: campaignId });
  if (error) {
    // Fallback: manual increment
    const campaign = await getCampaign(campaignId);
    if (campaign) {
      await supabase
        .from('campaigns')
        .update({ leads_count: (campaign.leads_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', campaignId);
    }
  }
}

export async function markLeadRouted(leadId: string, campaignId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('leads')
    .update({
      campaign_id: campaignId,
      campaign_status: 'routed',
      campaign_routed_at: new Date().toISOString(),
    })
    .eq('id', leadId);
  if (error) throw error;
}

export async function setSuggestedCampaign(leadId: string, campaignId: string, reason: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('leads')
    .update({
      suggested_campaign_id: campaignId,
      suggested_campaign_reason: reason,
    })
    .eq('id', leadId);
  if (error) throw error;
}

export async function markLeadSkipped(leadId: string, reason: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('leads')
    .update({
      campaign_status: 'skipped',
      skip_reason: reason,
    })
    .eq('id', leadId);
  if (error) throw error;
}

// ============ Campaign Emails ============

export async function createCampaignEmails(emails: Omit<CampaignEmail, 'id' | 'created_at'>[]): Promise<CampaignEmail[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaign_emails')
    .insert(emails)
    .select();

  if (error) throw error;
  return data || [];
}

export async function getCampaignEmails(campaignId: string): Promise<CampaignEmail[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('campaign_emails')
    .select()
    .eq('campaign_id', campaignId)
    .order('step', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============ Daily Digests ============

export async function createDailyDigest(digest: Omit<DailyDigest, 'id'>): Promise<DailyDigest> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('daily_digests')
    .insert(digest)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDigestsForCompany(companyId: string, limit = 30): Promise<DailyDigest[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('daily_digests')
    .select()
    .eq('company_id', companyId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============ Allowed Users ============

export async function isUserAllowed(email: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('allowed_users')
    .select('id')
    .eq('email', email.toLowerCase())
    .limit(1);

  if (error) throw error;
  return (data?.length || 0) > 0;
}

export async function addAllowedUser(email: string): Promise<AllowedUser> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('allowed_users')
    .insert({ email: email.toLowerCase() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('allowed_users')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============ Aggregate Stats ============

export async function getCompanyStats(companyId: string): Promise<{
  totalLeads: number;
  leadsWithEmails: number;
  totalCampaigns: number;
  totalEmailsSent: number;
  totalOpens: number;
  totalReplies: number;
}> {
  const supabase = getSupabaseClient();

  // Get lead counts
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('query_id', (await getExaQueriesForCompany(companyId)).map(q => q.id));

  const { count: leadsWithEmails } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('email', 'is', null);

  // Get campaign stats
  const campaigns = await listCampaigns(companyId);
  const totalCampaigns = campaigns.length;
  const totalEmailsSent = campaigns.reduce((sum, c) => sum + c.emails_sent, 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + c.opens, 0);
  const totalReplies = campaigns.reduce((sum, c) => sum + c.replies, 0);

  return {
    totalLeads: totalLeads || 0,
    leadsWithEmails: leadsWithEmails || 0,
    totalCampaigns,
    totalEmailsSent,
    totalOpens,
    totalReplies,
  };
}
