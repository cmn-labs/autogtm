import type { Company, Campaign } from '../types';
export interface CreateCampaignForPersonaParams {
    company: Pick<Company, 'id' | 'name' | 'description' | 'target_audience'> & {
        sending_emails?: string[];
        default_sequence_length?: number;
        email_prompt?: string | null;
    };
    suggestedName: string;
    suggestedPersona: string;
    leadId: string;
    leadFullName?: string | null;
    leadBio?: string | null;
    leadCategory?: string | null;
}
export declare function createDraftCampaignForLead(params: CreateCampaignForPersonaParams): Promise<Campaign>;
export declare function sendDraftCampaignForLead(params: {
    campaignId: string;
    leadId: string;
    companySendingEmails?: string[] | null;
}): Promise<Campaign>;
export declare function createCampaignForPersona(params: CreateCampaignForPersonaParams): Promise<Campaign>;
