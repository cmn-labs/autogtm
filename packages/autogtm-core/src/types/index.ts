import { z } from 'zod';

// Company schema
export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  website: z.string().url(),
  description: z.string(),
  target_audience: z.string(),
  default_sequence_length: z.number().min(1).max(3).default(2),
  // Autopilot (daily auto-add sweep) preferences
  auto_add_enabled: z.boolean().optional(),
  auto_add_min_fit_score: z.number().min(1).max(10).optional(),
  auto_add_daily_limit: z.number().min(0).max(500).optional(),
  auto_add_run_hour_utc: z.number().min(0).max(23).optional(),
  auto_add_digest_email: z.string().nullable().optional(),
  auto_add_regenerate_drafts: z.boolean().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Company = z.infer<typeof CompanySchema>;

// Auto Add Run — audit record for each daily sweep
export const AutoAddRunBreakdownEntrySchema = z.object({
  campaignId: z.string().uuid(),
  campaignName: z.string(),
  count: z.number(),
  avgFitScore: z.number(),
});
export type AutoAddRunBreakdownEntry = z.infer<typeof AutoAddRunBreakdownEntrySchema>;

export const AutoAddRunSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  run_started_at: z.string().datetime(),
  run_completed_at: z.string().datetime().nullable(),
  leads_considered: z.number().default(0),
  leads_added: z.number().default(0),
  leads_skipped: z.number().default(0),
  min_fit_score: z.number(),
  daily_limit: z.number(),
  breakdown: z.array(AutoAddRunBreakdownEntrySchema).default([]),
  added_lead_ids: z.array(z.string().uuid()).default([]),
  skip_reasons: z.record(z.number()).default({}),
  digest_sent: z.boolean().default(false),
  digest_error: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  trigger: z.enum(['cron', 'manual']).default('cron'),
});
export type AutoAddRun = z.infer<typeof AutoAddRunSchema>;

// Exa Query schema
export const ExaQuerySchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  query: z.string(),
  criteria: z.array(z.string()),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ExaQuery = z.infer<typeof ExaQuerySchema>;

// Webset Run schema
export const WebsetRunSchema = z.object({
  id: z.string().uuid(),
  query_id: z.string().uuid(),
  webset_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  items_found: z.number().default(0),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});
export type WebsetRun = z.infer<typeof WebsetRunSchema>;

// Lead category enum
export const LeadCategorySchema = z.enum(['influencer', 'coach', 'blog', 'agency', 'podcast', 'other']);
export type LeadCategory = z.infer<typeof LeadCategorySchema>;

// Lead enrichment status enum
export const EnrichmentStatusSchema = z.enum(['pending', 'enriching', 'enriched', 'failed']);
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>;

// Social links schema
export const SocialLinksSchema = z.object({
  instagram: z.string().url().optional(),
  tiktok: z.string().url().optional(),
  youtube: z.string().url().optional(),
  twitter: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  facebook: z.string().url().optional(),
  website: z.string().url().optional(),
}).passthrough();
export type SocialLinks = z.infer<typeof SocialLinksSchema>;

// Lead schema
export const LeadSchema = z.object({
  id: z.string().uuid(),
  query_id: z.string().uuid(),
  webset_run_id: z.string().uuid().nullable(),
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  url: z.string().url(),
  platform: z.string().nullable(),
  follower_count: z.number().nullable(),
  enrichment_data: z.record(z.unknown()).nullable(),
  created_at: z.string().datetime(),
  // Enriched fields
  category: LeadCategorySchema.nullable().optional(),
  full_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  expertise: z.array(z.string()).nullable().optional(),
  social_links: SocialLinksSchema.nullable().optional(),
  total_audience: z.number().nullable().optional(),
  content_types: z.array(z.string()).nullable().optional(),
  promotion_fit_score: z.number().min(1).max(10).nullable().optional(),
  promotion_fit_reason: z.string().nullable().optional(),
  enrichment_status: EnrichmentStatusSchema.default('pending'),
  enriched_at: z.string().datetime().nullable().optional(),
  // Campaign routing fields
  suggested_campaign_id: z.string().uuid().nullable().optional(),
  suggested_campaign_reason: z.string().nullable().optional(),
  campaign_id: z.string().uuid().nullable().optional(),
  campaign_status: z.enum(['pending', 'routed', 'skipped']).default('pending'),
  campaign_routed_at: z.string().datetime().nullable().optional(),
  skip_reason: z.string().nullable().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;

// Enriched lead data (output from AI enrichment)
export const EnrichedLeadDataSchema = z.object({
  category: LeadCategorySchema,
  full_name: z.string(),
  title: z.string(),
  bio: z.string(),
  expertise: z.array(z.string()),
  social_links: SocialLinksSchema,
  total_audience: z.number(),
  content_types: z.array(z.string()),
  promotion_fit_score: z.number().min(1).max(10),
  promotion_fit_reason: z.string(),
  email: z.string().nullable().optional(),
});
export type EnrichedLeadData = z.infer<typeof EnrichedLeadDataSchema>;

// Campaign schema
export const CampaignSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  source_lead_id: z.string().uuid().nullable().optional(),
  draft_type: z.enum(['lead']).default('lead'),
  instantly_campaign_id: z.string().nullable().optional(),
  name: z.string(),
  status: z.enum(['draft', 'active', 'paused', 'completed']),
  leads_count: z.number().default(0),
  emails_sent: z.number().default(0),
  opens: z.number().default(0),
  replies: z.number().default(0),
  persona: z.string().nullable().optional(),
  target_criteria: z.record(z.unknown()).nullable().optional(),
  is_accepting_leads: z.boolean().default(true),
  max_leads: z.number().default(500),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// Campaign with live stats (enriched with Instantly analytics)
export interface CampaignWithStats extends Campaign {
  open_rate: number;
  reply_rate: number;
}

// Agent routing decision
export type CampaignRoutingDecision =
  | { action: 'create_new'; suggestedName: string; suggestedPersona: string; reason: string }
  | { action: 'skip'; reason: string };

// Campaign Email schema (email copy)
export const CampaignEmailSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  step: z.number(), // 0 = initial, 1 = follow-up 1, 2 = follow-up 2
  subject: z.string(),
  body: z.string(),
  delay_days: z.number().default(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
});
export type CampaignEmail = z.infer<typeof CampaignEmailSchema>;

// Daily Digest schema
export const DailyDigestSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  date: z.string(),
  leads_found: z.number().default(0),
  emails_sent: z.number().default(0),
  opens: z.number().default(0),
  replies: z.number().default(0),
  sent_at: z.string().datetime(),
});
export type DailyDigest = z.infer<typeof DailyDigestSchema>;

// Allowed User schema (for OTP whitelist)
export const AllowedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  created_at: z.string().datetime(),
});
export type AllowedUser = z.infer<typeof AllowedUserSchema>;

// API Response types
export interface ExaWebsetItem {
  id: string;
  properties: {
    url: string;
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
  enrichments?: Record<string, unknown>;
}

export interface ExaWebsetResponse {
  id: string;
  status: string;
  items: ExaWebsetItem[];
}

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: number;
  timestamp_created: string;
}

export interface InstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  variables?: Record<string, string>;
}

export interface InstantlySequenceStep {
  subject: string;
  body: string;
  delay?: number; // delay in days
}

// AI Generation types
export interface GeneratedQuery {
  query: string;
  criteria: string[];
  rationale: string;
}

export interface GeneratedEmailSequence {
  initial: {
    subject: string;
    body: string;
  };
  followUp1: {
    subject: string;
    body: string;
    delayDays: number;
  };
  followUp2?: {
    subject: string;
    body: string;
    delayDays: number;
  };
}
