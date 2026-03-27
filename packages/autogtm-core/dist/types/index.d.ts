import { z } from 'zod';
export declare const CompanySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    website: z.ZodString;
    description: z.ZodString;
    target_audience: z.ZodString;
    default_sequence_length: z.ZodDefault<z.ZodNumber>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    name?: string;
    website?: string;
    description?: string;
    target_audience?: string;
    default_sequence_length?: number;
    created_at?: string;
    updated_at?: string;
}, {
    id?: string;
    name?: string;
    website?: string;
    description?: string;
    target_audience?: string;
    default_sequence_length?: number;
    created_at?: string;
    updated_at?: string;
}>;
export type Company = z.infer<typeof CompanySchema>;
export declare const ExaQuerySchema: z.ZodObject<{
    id: z.ZodString;
    company_id: z.ZodString;
    query: z.ZodString;
    criteria: z.ZodArray<z.ZodString, "many">;
    is_active: z.ZodDefault<z.ZodBoolean>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    created_at?: string;
    updated_at?: string;
    company_id?: string;
    query?: string;
    criteria?: string[];
    is_active?: boolean;
}, {
    id?: string;
    created_at?: string;
    updated_at?: string;
    company_id?: string;
    query?: string;
    criteria?: string[];
    is_active?: boolean;
}>;
export type ExaQuery = z.infer<typeof ExaQuerySchema>;
export declare const WebsetRunSchema: z.ZodObject<{
    id: z.ZodString;
    query_id: z.ZodString;
    webset_id: z.ZodString;
    status: z.ZodEnum<["pending", "running", "completed", "failed"]>;
    items_found: z.ZodDefault<z.ZodNumber>;
    started_at: z.ZodString;
    completed_at: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    status?: "pending" | "running" | "completed" | "failed";
    query_id?: string;
    webset_id?: string;
    items_found?: number;
    started_at?: string;
    completed_at?: string;
}, {
    id?: string;
    status?: "pending" | "running" | "completed" | "failed";
    query_id?: string;
    webset_id?: string;
    items_found?: number;
    started_at?: string;
    completed_at?: string;
}>;
export type WebsetRun = z.infer<typeof WebsetRunSchema>;
export declare const LeadCategorySchema: z.ZodEnum<["influencer", "coach", "blog", "agency", "podcast", "other"]>;
export type LeadCategory = z.infer<typeof LeadCategorySchema>;
export declare const EnrichmentStatusSchema: z.ZodEnum<["pending", "enriching", "enriched", "failed"]>;
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>;
export declare const SocialLinksSchema: z.ZodObject<{
    instagram: z.ZodOptional<z.ZodString>;
    tiktok: z.ZodOptional<z.ZodString>;
    youtube: z.ZodOptional<z.ZodString>;
    twitter: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodOptional<z.ZodString>;
    facebook: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    instagram: z.ZodOptional<z.ZodString>;
    tiktok: z.ZodOptional<z.ZodString>;
    youtube: z.ZodOptional<z.ZodString>;
    twitter: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodOptional<z.ZodString>;
    facebook: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    instagram: z.ZodOptional<z.ZodString>;
    tiktok: z.ZodOptional<z.ZodString>;
    youtube: z.ZodOptional<z.ZodString>;
    twitter: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodOptional<z.ZodString>;
    facebook: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export type SocialLinks = z.infer<typeof SocialLinksSchema>;
export declare const LeadSchema: z.ZodObject<{
    id: z.ZodString;
    query_id: z.ZodString;
    webset_run_id: z.ZodNullable<z.ZodString>;
    name: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    url: z.ZodString;
    platform: z.ZodNullable<z.ZodString>;
    follower_count: z.ZodNullable<z.ZodNumber>;
    enrichment_data: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    created_at: z.ZodString;
    category: z.ZodOptional<z.ZodNullable<z.ZodEnum<["influencer", "coach", "blog", "agency", "podcast", "other"]>>>;
    full_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expertise: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    social_links: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>>;
    total_audience: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    content_types: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    promotion_fit_score: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    promotion_fit_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    enrichment_status: z.ZodDefault<z.ZodEnum<["pending", "enriching", "enriched", "failed"]>>;
    enriched_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    suggested_campaign_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    suggested_campaign_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    campaign_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    campaign_status: z.ZodDefault<z.ZodEnum<["pending", "routed", "skipped"]>>;
    campaign_routed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    skip_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    name?: string;
    created_at?: string;
    query_id?: string;
    webset_run_id?: string;
    email?: string;
    url?: string;
    platform?: string;
    follower_count?: number;
    enrichment_data?: Record<string, unknown>;
    category?: "influencer" | "coach" | "blog" | "agency" | "podcast" | "other";
    full_name?: string;
    title?: string;
    bio?: string;
    expertise?: string[];
    social_links?: {
        website?: string;
        instagram?: string;
        tiktok?: string;
        youtube?: string;
        twitter?: string;
        linkedin?: string;
        facebook?: string;
    } & {
        [k: string]: unknown;
    };
    total_audience?: number;
    content_types?: string[];
    promotion_fit_score?: number;
    promotion_fit_reason?: string;
    enrichment_status?: "pending" | "failed" | "enriching" | "enriched";
    enriched_at?: string;
    suggested_campaign_id?: string;
    suggested_campaign_reason?: string;
    campaign_id?: string;
    campaign_status?: "pending" | "routed" | "skipped";
    campaign_routed_at?: string;
    skip_reason?: string;
}, {
    id?: string;
    name?: string;
    created_at?: string;
    query_id?: string;
    webset_run_id?: string;
    email?: string;
    url?: string;
    platform?: string;
    follower_count?: number;
    enrichment_data?: Record<string, unknown>;
    category?: "influencer" | "coach" | "blog" | "agency" | "podcast" | "other";
    full_name?: string;
    title?: string;
    bio?: string;
    expertise?: string[];
    social_links?: {
        website?: string;
        instagram?: string;
        tiktok?: string;
        youtube?: string;
        twitter?: string;
        linkedin?: string;
        facebook?: string;
    } & {
        [k: string]: unknown;
    };
    total_audience?: number;
    content_types?: string[];
    promotion_fit_score?: number;
    promotion_fit_reason?: string;
    enrichment_status?: "pending" | "failed" | "enriching" | "enriched";
    enriched_at?: string;
    suggested_campaign_id?: string;
    suggested_campaign_reason?: string;
    campaign_id?: string;
    campaign_status?: "pending" | "routed" | "skipped";
    campaign_routed_at?: string;
    skip_reason?: string;
}>;
export type Lead = z.infer<typeof LeadSchema>;
export declare const EnrichedLeadDataSchema: z.ZodObject<{
    category: z.ZodEnum<["influencer", "coach", "blog", "agency", "podcast", "other"]>;
    full_name: z.ZodString;
    title: z.ZodString;
    bio: z.ZodString;
    expertise: z.ZodArray<z.ZodString, "many">;
    social_links: z.ZodObject<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        instagram: z.ZodOptional<z.ZodString>;
        tiktok: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>;
    total_audience: z.ZodNumber;
    content_types: z.ZodArray<z.ZodString, "many">;
    promotion_fit_score: z.ZodNumber;
    promotion_fit_reason: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    email?: string;
    category?: "influencer" | "coach" | "blog" | "agency" | "podcast" | "other";
    full_name?: string;
    title?: string;
    bio?: string;
    expertise?: string[];
    social_links?: {
        website?: string;
        instagram?: string;
        tiktok?: string;
        youtube?: string;
        twitter?: string;
        linkedin?: string;
        facebook?: string;
    } & {
        [k: string]: unknown;
    };
    total_audience?: number;
    content_types?: string[];
    promotion_fit_score?: number;
    promotion_fit_reason?: string;
}, {
    email?: string;
    category?: "influencer" | "coach" | "blog" | "agency" | "podcast" | "other";
    full_name?: string;
    title?: string;
    bio?: string;
    expertise?: string[];
    social_links?: {
        website?: string;
        instagram?: string;
        tiktok?: string;
        youtube?: string;
        twitter?: string;
        linkedin?: string;
        facebook?: string;
    } & {
        [k: string]: unknown;
    };
    total_audience?: number;
    content_types?: string[];
    promotion_fit_score?: number;
    promotion_fit_reason?: string;
}>;
export type EnrichedLeadData = z.infer<typeof EnrichedLeadDataSchema>;
export declare const CampaignSchema: z.ZodObject<{
    id: z.ZodString;
    company_id: z.ZodString;
    source_lead_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    draft_type: z.ZodDefault<z.ZodEnum<["lead"]>>;
    instantly_campaign_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    status: z.ZodEnum<["draft", "active", "paused", "completed"]>;
    leads_count: z.ZodDefault<z.ZodNumber>;
    emails_sent: z.ZodDefault<z.ZodNumber>;
    opens: z.ZodDefault<z.ZodNumber>;
    replies: z.ZodDefault<z.ZodNumber>;
    persona: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_criteria: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    is_accepting_leads: z.ZodDefault<z.ZodBoolean>;
    max_leads: z.ZodDefault<z.ZodNumber>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    name?: string;
    created_at?: string;
    updated_at?: string;
    status?: "completed" | "draft" | "active" | "paused";
    company_id?: string;
    source_lead_id?: string;
    draft_type?: "lead";
    instantly_campaign_id?: string;
    leads_count?: number;
    emails_sent?: number;
    opens?: number;
    replies?: number;
    persona?: string;
    target_criteria?: Record<string, unknown>;
    is_accepting_leads?: boolean;
    max_leads?: number;
}, {
    id?: string;
    name?: string;
    created_at?: string;
    updated_at?: string;
    status?: "completed" | "draft" | "active" | "paused";
    company_id?: string;
    source_lead_id?: string;
    draft_type?: "lead";
    instantly_campaign_id?: string;
    leads_count?: number;
    emails_sent?: number;
    opens?: number;
    replies?: number;
    persona?: string;
    target_criteria?: Record<string, unknown>;
    is_accepting_leads?: boolean;
    max_leads?: number;
}>;
export type Campaign = z.infer<typeof CampaignSchema>;
export interface CampaignWithStats extends Campaign {
    open_rate: number;
    reply_rate: number;
}
export type CampaignRoutingDecision = {
    action: 'create_new';
    suggestedName: string;
    suggestedPersona: string;
    reason: string;
} | {
    action: 'skip';
    reason: string;
};
export declare const CampaignEmailSchema: z.ZodObject<{
    id: z.ZodString;
    campaign_id: z.ZodString;
    step: z.ZodNumber;
    subject: z.ZodString;
    body: z.ZodString;
    delay_days: z.ZodDefault<z.ZodNumber>;
    created_at: z.ZodString;
    updated_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    created_at?: string;
    updated_at?: string;
    campaign_id?: string;
    step?: number;
    subject?: string;
    body?: string;
    delay_days?: number;
}, {
    id?: string;
    created_at?: string;
    updated_at?: string;
    campaign_id?: string;
    step?: number;
    subject?: string;
    body?: string;
    delay_days?: number;
}>;
export type CampaignEmail = z.infer<typeof CampaignEmailSchema>;
export declare const DailyDigestSchema: z.ZodObject<{
    id: z.ZodString;
    company_id: z.ZodString;
    date: z.ZodString;
    leads_found: z.ZodDefault<z.ZodNumber>;
    emails_sent: z.ZodDefault<z.ZodNumber>;
    opens: z.ZodDefault<z.ZodNumber>;
    replies: z.ZodDefault<z.ZodNumber>;
    sent_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    company_id?: string;
    date?: string;
    emails_sent?: number;
    opens?: number;
    replies?: number;
    leads_found?: number;
    sent_at?: string;
}, {
    id?: string;
    company_id?: string;
    date?: string;
    emails_sent?: number;
    opens?: number;
    replies?: number;
    leads_found?: number;
    sent_at?: string;
}>;
export type DailyDigest = z.infer<typeof DailyDigestSchema>;
export declare const AllowedUserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    created_at?: string;
    email?: string;
}, {
    id?: string;
    created_at?: string;
    email?: string;
}>;
export type AllowedUser = z.infer<typeof AllowedUserSchema>;
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
    delay?: number;
}
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
