/**
 * Instantly V2 API Client
 * Docs: https://developer.instantly.ai/
 */

import type { InstantlyCampaign, InstantlyLead, InstantlySequenceStep } from '../types';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2';

function getApiKey(): string {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    throw new Error('INSTANTLY_API_KEY is required');
  }
  return apiKey;
}

async function instantlyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${INSTANTLY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Instantly API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export interface CreateCampaignParams {
  name: string;
  emailList: string[]; // sending email accounts
  sequences: InstantlySequenceStep[];
  schedule?: {
    timezone: string;
    from: string; // "09:00"
    to: string;   // "17:00"
    days: Record<string, boolean>; // { "0": false, "1": true, ... } (0=Sunday)
  };
  dailyLimit?: number;
  stopOnReply?: boolean;
}

/**
 * Create a new campaign with email sequences
 */
export async function createCampaign(params: CreateCampaignParams): Promise<InstantlyCampaign> {
  const schedule = params.schedule || {
    timezone: 'America/Chicago',
    from: '09:00',
    to: '17:00',
    days: { '1': true, '2': true, '3': true, '4': true, '5': true, '0': false, '6': false },
  };

  // Build sequences in Instantly V2 format (each step needs variants array)
  // API: step.delay = days to wait before sending the NEXT email after this one
  const steps = params.sequences;
  const sequences = [{
    steps: steps.map((step, index) => ({
      type: 'email',
      delay: index < steps.length - 1 ? (steps[index + 1].delay || 2) : 0,
      delay_unit: 'days',
      variants: [{
        subject: step.subject,
        body: step.body,
      }],
    })),
  }];

  const response = await instantlyFetch<InstantlyCampaign>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      campaign_schedule: {
        schedules: [{
          name: 'Default Schedule',
          timing: { from: schedule.from, to: schedule.to },
          days: schedule.days,
          timezone: schedule.timezone,
        }],
      },
      sequences,
      email_list: params.emailList,
      daily_limit: params.dailyLimit || 50,
      stop_on_reply: params.stopOnReply ?? true,
      text_only: false,
      link_tracking: true,
      open_tracking: true,
    }),
  });

  return response;
}

/**
 * Add leads to a campaign (V2 API: one request per lead)
 */
export async function addLeadsToCampaign(
  campaignId: string,
  leads: InstantlyLead[]
): Promise<void> {
  for (const lead of leads) {
    await instantlyFetch('/leads', {
      method: 'POST',
      body: JSON.stringify({
        campaign: campaignId,
        email: lead.email,
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        company_name: lead.company_name || '',
        skip_if_in_campaign: true,
        ...(lead.variables && Object.keys(lead.variables).length > 0
          ? { custom_variables: lead.variables }
          : {}),
      }),
    });
  }
}

/**
 * Activate (start) a campaign
 */
export async function activateCampaign(campaignId: string): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Pause a campaign
 */
export async function pauseCampaign(campaignId: string): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Get campaign details
 */
export async function getCampaign(campaignId: string): Promise<InstantlyCampaign> {
  return instantlyFetch<InstantlyCampaign>(`/campaigns/${campaignId}`);
}

/**
 * List all campaigns
 */
export async function listCampaigns(options?: {
  limit?: number;
  status?: number;
}): Promise<{ items: InstantlyCampaign[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.status !== undefined) params.set('status', String(options.status));
  
  const query = params.toString() ? `?${params}` : '';
  return instantlyFetch<{ items: InstantlyCampaign[] }>(`/campaigns${query}`);
}

/**
 * Get campaign analytics
 */
export async function getCampaignAnalytics(campaignId: string): Promise<{
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}> {
  const response = await instantlyFetch<any>(`/campaigns/analytics?campaign_id=${campaignId}`);
  return {
    sent: response.sent || 0,
    opened: response.opened || 0,
    replied: response.replied || 0,
    bounced: response.bounced || 0,
  };
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  await instantlyFetch(`/campaigns/${campaignId}`, {
    method: 'DELETE',
  });
}

/**
 * List email accounts
 */
export async function listAccounts(): Promise<{ items: Array<{ email: string; status: number; warmup_status: number; daily_limit: number | null }> }> {
  return instantlyFetch('/accounts');
}

/**
 * Convenience function: Create and start a campaign with leads
 */
export async function launchCampaign(params: {
  name: string;
  emailList: string[];
  sequences: InstantlySequenceStep[];
  leads: InstantlyLead[];
}): Promise<InstantlyCampaign> {
  // Create campaign
  const campaign = await createCampaign({
    name: params.name,
    emailList: params.emailList,
    sequences: params.sequences,
  });

  // Add leads
  if (params.leads.length > 0) {
    await addLeadsToCampaign(campaign.id, params.leads);
  }

  // Activate
  await activateCampaign(campaign.id);

  return campaign;
}
