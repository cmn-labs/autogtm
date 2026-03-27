/**
 * AI agent that decides whether to create a per-lead campaign draft or skip.
 *
 * Given an enriched lead and company context, the agent decides:
 * create a new campaign draft, or skip.
 */
import type { Lead, CampaignWithStats, Company, CampaignRoutingDecision } from '../types';
export interface DetermineCampaignParams {
    lead: Pick<Lead, 'email' | 'full_name' | 'category' | 'platform' | 'bio' | 'expertise' | 'total_audience' | 'content_types' | 'promotion_fit_score' | 'promotion_fit_reason'>;
    campaigns: CampaignWithStats[];
    company: Pick<Company, 'name' | 'description' | 'target_audience'>;
    autoMode?: boolean;
}
export declare function determineCampaignForLead(params: DetermineCampaignParams): Promise<CampaignRoutingDecision>;
