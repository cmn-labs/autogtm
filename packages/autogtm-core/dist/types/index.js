import { z } from 'zod';
// Company schema
export const CompanySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    website: z.string().url(),
    description: z.string(),
    target_audience: z.string(),
    default_sequence_length: z.number().min(1).max(3).default(2),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});
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
// Lead category enum
export const LeadCategorySchema = z.enum(['influencer', 'coach', 'blog', 'agency', 'podcast', 'other']);
// Lead enrichment status enum
export const EnrichmentStatusSchema = z.enum(['pending', 'enriching', 'enriched', 'failed']);
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
// Allowed User schema (for OTP whitelist)
export const AllowedUserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    created_at: z.string().datetime(),
});
//# sourceMappingURL=index.js.map