import { inngest } from './client';
import { getExaClient } from '@autogtm/core/clients/exa';
import { enrichLead } from '@autogtm/core/ai/enrichLead';
import {
  getCampaign,
  getCampaignAnalytics,
} from '@autogtm/core/clients/instantly';
import {
  updateCampaignStats,
  createDailyDigest,
  getLeadsByDateRange,
  markLeadSkipped,
  setSuggestedCampaign,
  getCampaignBySourceLeadId,
  listAutoEnabledCompanies,
  getEligibleLeadsForAutoAdd,
  countReadyToAddLeads,
  createAutoAddRun,
  completeAutoAddRun,
} from '@autogtm/core/db/autogtmDbCalls';
import { determineCampaignForLead } from '@autogtm/core/ai/determineCampaign';
import { createDraftCampaignForLead } from '@autogtm/core/campaigns/createCampaignForPersona';
import { addLeadToCampaignCore, type AddLeadToCampaignResult } from '@autogtm/core/campaigns/addLeadToCampaign';
import type { AutoAddRunBreakdownEntry } from '@autogtm/core/types';
import { extractEmailFromEnrichmentData } from '@autogtm/core/ai/extractEmail';
import { resolveOutreachPromptForLead } from '@/lib/outreachPromptResolver';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function mapInstantlyCampaignStatus(status: number): 'draft' | 'active' | 'paused' | 'completed' {
  // Instantly status codes: 0=draft, 1=active, 2=paused, 3=completed, 4=sub-sequences running.
  if (status === 0) return 'draft';
  if (status === 1 || status === 4) return 'active';
  if (status === 2) return 'paused';
  if (status === 3) return 'completed';
  // Unknown/negative statuses are treated as paused locally to avoid invalid DB values.
  return 'paused';
}

/** Check if system is enabled for a company. Returns false if disabled. */
async function isSystemEnabled(supabase: any, companyId: string): Promise<boolean> {
  const { data } = await supabase.from('companies').select('system_enabled').eq('id', companyId).single();
  return data?.system_enabled === true;
}

/**
 * Extract email from Exa enrichment data (handles multiple formats)
 */
function extractEmailFromEnrichments(enrichments: any): string | null {
  if (!enrichments) return null;

  // Direct email field
  if (typeof enrichments.email === 'string') return enrichments.email;

  // Array of enrichment objects (Exa webset format)
  if (Array.isArray(enrichments)) {
    for (const e of enrichments) {
      if (e?.format === 'email' && Array.isArray(e?.result) && e.result.length > 0) {
        return e.result[0];
      }
    }
  }

  // Named enrichment fields
  const emailKeys = ['Find the email address for this person or creator', 'email_address', 'contact_email'];
  for (const key of emailKeys) {
    const val = enrichments[key];
    if (typeof val === 'string') return val;
    if (val?.value && typeof val.value === 'string') return val.value;
    if (Array.isArray(val?.result) && val.result.length > 0) return val.result[0];
  }

  return null;
}

/**
 * Process Webset Run - Polls webset status and extracts leads when done
 * Triggered when a query is run manually
 */
export const processWebsetRun = inngest.createFunction(
  {
    id: 'process-webset-run',
    name: 'Process Webset Run',
    retries: 3,
    concurrency: [{ limit: 1 }],
  },
  { event: 'autogtm/webset.created' },
  async ({ event, step, logger }) => {
    const { queryId, websetId, websetRunId } = event.data;
    const exa = getExaClient();
    const supabase = getSupabase();

    logger.info(`Processing webset ${websetId} for query ${queryId}`);

    // Poll until webset is done
    let websetStatus = 'running';
    let attempts = 0;
    const pollIntervalSeconds = 10;
    const maxAttempts = 540; // 90 minutes max (540 * 10 seconds)

    while (websetStatus !== 'idle' && attempts < maxAttempts) {
      await step.sleep(`wait-${attempts}`, `${pollIntervalSeconds}s`);
      attempts++;

      const webset = await step.run(`check-status-${attempts}`, async () => {
        return exa.websets.get(websetId);
      });

      websetStatus = webset.status;
      logger.info(`Webset ${websetId} status: ${websetStatus} (attempt ${attempts})`);

      // Update progress in DB
      const search = webset.searches?.[0];
      const progress = search?.progress;
      if (progress) {
        await supabase
          .from('webset_runs')
          .update({ items_found: progress.found || 0 })
          .eq('id', websetRunId);
      }
    }

    if (websetStatus !== 'idle') {
      // Timed out
      await supabase.from('webset_runs').update({ status: 'failed' }).eq('id', websetRunId);
      await supabase.from('exa_queries').update({ status: 'failed' }).eq('id', queryId);
      throw new Error(`Webset ${websetId} timed out after ${maxAttempts * pollIntervalSeconds} seconds`);
    }

    // Extract items and create leads
    const result = await step.run('extract-leads', async () => {
      const itemsGenerator = exa.websets.items.listAll(websetId);
      const itemsArray: any[] = [];
      for await (const item of itemsGenerator) {
        itemsArray.push(item);
      }

      const leads = [];
      for (const item of itemsArray) {
        const data = item.model_dump ? item.model_dump() : item;

        const name = data.properties?.title || data.properties?.name || 'Unknown';
        const sourceUrl = data.properties?.url ? String(data.properties.url) : '';

        // Extract enrichments
        const email = extractEmailFromEnrichments(data.enrichments);
        const followers = data.enrichments?.followers ||
          data.enrichments?.['Extract the follower or subscriber count if visible']?.value ||
          data.enrichments?.['Extract the follower or subscriber count if visible'] ||
          null;

        // Determine platform
        let platform = 'other';
        if (sourceUrl.includes('tiktok.com')) platform = 'tiktok';
        else if (sourceUrl.includes('instagram.com')) platform = 'instagram';
        else if (sourceUrl.includes('youtube.com')) platform = 'youtube';
        else if (sourceUrl.includes('twitter.com') || sourceUrl.includes('x.com')) platform = 'twitter';
        else if (sourceUrl.includes('linkedin.com')) platform = 'linkedin';

        // Check for duplicate
        if (email) {
          const { data: existing } = await supabase
            .from('leads')
            .select('id')
            .eq('email', email)
            .single();
          if (existing) continue;
        }

        leads.push({
          query_id: queryId,
          webset_run_id: websetRunId,
          name,
          email,
          url: sourceUrl,
          platform,
          follower_count: followers ? parseInt(String(followers), 10) : null,
          enrichment_data: data,
          enrichment_status: 'pending' as const,
          campaign_status: 'pending' as const,
        });
      }

      // Insert leads and get IDs back
      let insertedLeads: Array<{ id: string; url: string; email: string | null; name: string | null }> = [];
      if (leads.length > 0) {
        const { data: inserted, error } = await supabase
          .from('leads')
          .insert(leads)
          .select('id, url, email, name');
        if (error) throw error;
        insertedLeads = inserted || [];
      }

      return { itemsFound: itemsArray.length, leadsCreated: leads.length, insertedLeads };
    });

    // Update webset run and query status
    await step.run('update-status', async () => {
      await supabase
        .from('webset_runs')
        .update({
          status: 'completed',
          items_found: result.itemsFound,
          completed_at: new Date().toISOString(),
        })
        .eq('id', websetRunId);

      await supabase
        .from('exa_queries')
        .update({
          status: 'completed',
          last_run_at: new Date().toISOString(),
        })
        .eq('id', queryId);
    });

    // Trigger enrichment for each lead
    if (result.insertedLeads.length > 0) {
      await step.run('trigger-enrichments', async () => {
        // Get company ID from query
        const { data: queryData } = await supabase
          .from('exa_queries')
          .select('company_id')
          .eq('id', queryId)
          .single();

        if (queryData?.company_id) {
          const enrichmentEvents = result.insertedLeads.map((lead) => ({
            name: 'autogtm/lead.created' as const,
            data: {
              leadId: lead.id,
              leadUrl: lead.url,
              leadEmail: lead.email,
              leadName: lead.name,
              companyId: queryData.company_id,
            },
          }));
          await inngest.send(enrichmentEvents);
          logger.info(`Triggered enrichment for ${result.insertedLeads.length} leads`);
        }
      });
    }

    logger.info(`Completed webset ${websetId}: ${result.itemsFound} items, ${result.leadsCreated} leads`);
    return result;
  }
);

/**
 * Daily Query Generation - Smart query generation based on instructions
 * 
 * Logic:
 * 1. Check for NEW instructions (query_generated = false)
 * 2. If found: Generate a FOCUSED query for each instruction, link it
 * 3. If none: Generate ONE exploration query (creative, avoids past queries)
 * 
 * Runs at 8:30 AM, before the webset search at 9 AM
 */
export const dailyQueryGeneration = inngest.createFunction(
  {
    id: 'daily-query-generation',
    name: 'Daily Query Generation',
  },
  { cron: '30 8 * * *' }, // 8:30 AM every day
  async ({ step, logger }) => {
    const supabase = getSupabase();

    // Get all companies with system enabled
    const companies = await step.run('get-companies', async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, name, website, description, target_audience, agent_notes')
        .eq('system_enabled', true);
      return data || [];
    });

    logger.info(`Processing ${companies.length} companies`);
    let totalQueriesGenerated = 0;

    for (const company of companies) {
      // Check for unprocessed instructions
      const unprocessedInstructions = await step.run(`check-instructions-${company.id}`, async () => {
        const { data } = await supabase
          .from('company_updates')
          .select('id, content, created_at')
          .eq('company_id', company.id)
          .eq('query_generated', false)
          .order('created_at', { ascending: true }); // Process oldest first
        return data || [];
      });

      if (unprocessedInstructions.length > 0) {
        // FOCUSED MODE: Generate query for each new instruction
        logger.info(`Found ${unprocessedInstructions.length} new instructions for ${company.name}`);

        for (const instruction of unprocessedInstructions) {
          await step.run(`focused-query-${instruction.id}`, async () => {
            const { generateFocusedQuery } = await import('@autogtm/core/ai/generateDailyQuery');
            
            const newQuery = await generateFocusedQuery({
              company: {
                name: company.name,
                website: company.website,
                description: company.description,
                targetAudience: company.target_audience,
              },
              instruction: instruction.content,
            });

            // Save query with instruction linkage
            const { error: queryError } = await supabase.from('exa_queries').insert({
              company_id: company.id,
              query: newQuery.query,
              criteria: newQuery.criteria,
              is_active: true,
              status: 'pending',
              source_instruction_id: instruction.id,
              generation_rationale: newQuery.rationale,
            });

            if (queryError) {
              logger.error(`Failed to save focused query:`, queryError);
              throw queryError;
            }

            // Mark instruction as processed
            await supabase
              .from('company_updates')
              .update({ query_generated: true })
              .eq('id', instruction.id);

            logger.info(`Generated focused query for instruction: "${instruction.content.substring(0, 50)}..."`);
            logger.info(`Query: "${newQuery.query}"`);
            totalQueriesGenerated++;
          });
        }
      } else {
        // EXPLORATION MODE: No new instructions, explore creatively
        await step.run(`exploration-query-${company.id}`, async () => {
          const { generateExplorationQuery } = await import('@autogtm/core/ai/generateDailyQuery');

          // Get past queries for context
          const { data: pastQueries } = await supabase
            .from('exa_queries')
            .select('query, criteria')
            .eq('company_id', company.id)
            .order('created_at', { ascending: false })
            .limit(20);

          // Get lead counts
          const pastQueriesWithCounts = await Promise.all(
            (pastQueries || []).map(async (q) => {
              const { count } = await supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('query_id', q.query);
              return { ...q, leads_found: count || 0 };
            })
          );

          const newQuery = await generateExplorationQuery({
            company: {
              name: company.name,
              website: company.website,
              description: company.description,
              targetAudience: company.target_audience,
              agentNotes: company.agent_notes,
            },
            pastQueries: pastQueriesWithCounts,
          });

          // Save exploration query (no instruction link)
          const { error } = await supabase.from('exa_queries').insert({
            company_id: company.id,
            query: newQuery.query,
            criteria: newQuery.criteria,
            is_active: true,
            status: 'pending',
            generation_rationale: newQuery.rationale,
          });

          if (error) {
            logger.error(`Failed to save exploration query:`, error);
            throw error;
          }

          logger.info(`Generated exploration query for ${company.name}: "${newQuery.query}"`);
          logger.info(`Rationale: ${newQuery.rationale}`);
          totalQueriesGenerated++;
        });
      }
    }

    return { companiesProcessed: companies.length, queriesGenerated: totalQueriesGenerated };
  }
);

/**
 * On-demand Query Generation - Triggered manually from the dashboard
 * Same logic as daily generation but for a single company
 */
export const generateQueriesOnDemand = inngest.createFunction(
  {
    id: 'generate-queries-on-demand',
    name: 'Generate Queries On Demand',
    retries: 1,
    concurrency: [{ limit: 1 }],
  },
  { event: 'autogtm/queries.generate' },
  async ({ event, step, logger }) => {
    const { companyId } = event.data;
    const supabase = getSupabase();

    const systemOn = await step.run('check-system', () => isSystemEnabled(supabase, companyId));
    if (!systemOn) {
      logger.info(`System disabled for company ${companyId}, skipping query generation`);
      return { skipped: true };
    }

    const company = await step.run('get-company', async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, name, website, description, target_audience, agent_notes')
        .eq('id', companyId)
        .single();
      return data;
    });

    if (!company) throw new Error(`Company ${companyId} not found`);

    let queriesGenerated = 0;

    const unprocessedInstructions = await step.run('check-instructions', async () => {
      const { data } = await supabase
        .from('company_updates')
        .select('id, content, created_at')
        .eq('company_id', company.id)
        .eq('query_generated', false)
        .order('created_at', { ascending: true });
      return data || [];
    });

    if (unprocessedInstructions.length > 0) {
      for (const instruction of unprocessedInstructions) {
        await step.run(`focused-query-${instruction.id}`, async () => {
          const { generateFocusedQuery } = await import('@autogtm/core/ai/generateDailyQuery');
          const newQuery = await generateFocusedQuery({
            company: { name: company.name, website: company.website, description: company.description, targetAudience: company.target_audience },
            instruction: instruction.content,
          });
          await supabase.from('exa_queries').insert({
            company_id: company.id, query: newQuery.query, criteria: newQuery.criteria,
            is_active: true, status: 'pending', source_instruction_id: instruction.id, generation_rationale: newQuery.rationale,
          });
          await supabase.from('company_updates').update({ query_generated: true }).eq('id', instruction.id);
          queriesGenerated++;
        });
      }
    } else {
      await step.run('exploration-query', async () => {
        const { generateExplorationQuery } = await import('@autogtm/core/ai/generateDailyQuery');
        const { data: pastQueries } = await supabase.from('exa_queries').select('query, criteria').eq('company_id', company.id).order('created_at', { ascending: false }).limit(20);
        const newQuery = await generateExplorationQuery({
          company: { name: company.name, website: company.website, description: company.description, targetAudience: company.target_audience, agentNotes: company.agent_notes },
          pastQueries: (pastQueries || []).map(q => ({ ...q, leads_found: 0 })),
        });
        await supabase.from('exa_queries').insert({
          company_id: company.id, query: newQuery.query, criteria: newQuery.criteria,
          is_active: true, status: 'pending', generation_rationale: newQuery.rationale,
        });
        queriesGenerated++;
      });
    }

    logger.info(`Generated ${queriesGenerated} queries for ${company.name}`);
    return { queriesGenerated };
  }
);

/**
 * Targeted Query Generation - Generate query for one specific instruction
 */
export const generateQueryForInstruction = inngest.createFunction(
  {
    id: 'generate-query-for-instruction',
    name: 'Generate Query For Instruction',
    retries: 1,
    concurrency: [{ limit: 5 }],
  },
  { event: 'autogtm/queries.generate-for-instruction' },
  async ({ event, step, logger }) => {
    const { companyId, instructionId } = event.data as { companyId: string; instructionId: string };
    const supabase = getSupabase();

    const systemOn = await step.run('check-system', () => isSystemEnabled(supabase, companyId));
    if (!systemOn) {
      logger.info(`System disabled for company ${companyId}, skipping targeted generation`);
      return { skipped: true };
    }

    const company = await step.run('get-company', async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, name, website, description, target_audience')
        .eq('id', companyId)
        .single();
      return data;
    });

    const instruction = await step.run('get-instruction', async () => {
      const { data } = await supabase
        .from('company_updates')
        .select('id, company_id, content, query_generated')
        .eq('id', instructionId)
        .eq('company_id', companyId)
        .single();
      return data;
    });

    if (!company) throw new Error(`Company ${companyId} not found`);
    if (!instruction) throw new Error(`Instruction ${instructionId} not found for company ${companyId}`);

    const existingQuery = await step.run('check-existing-query', async () => {
      const { data } = await supabase
        .from('exa_queries')
        .select('id')
        .eq('company_id', companyId)
        .eq('source_instruction_id', instructionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    });

    if (existingQuery?.id) {
      logger.info(`Query already exists for instruction ${instructionId}: ${existingQuery.id}`);
      return { queryId: existingQuery.id, reused: true };
    }

    const generated = await step.run('generate-focused-query', async () => {
      const { generateFocusedQuery } = await import('@autogtm/core/ai/generateDailyQuery');
      return generateFocusedQuery({
        company: {
          name: company.name,
          website: company.website,
          description: company.description,
          targetAudience: company.target_audience,
        },
        instruction: instruction.content,
      });
    });

    const insertedQuery = await step.run('insert-query', async () => {
      const { data, error } = await supabase
        .from('exa_queries')
        .insert({
          company_id: companyId,
          query: generated.query,
          criteria: generated.criteria,
          is_active: true,
          status: 'pending',
          source_instruction_id: instructionId,
          generation_rationale: generated.rationale,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    });

    await step.run('mark-instruction-processed', async () => {
      await supabase
        .from('company_updates')
        .update({ query_generated: true })
        .eq('id', instructionId);
    });

    logger.info(`Generated query ${insertedQuery.id} for instruction ${instructionId}`);
    return { queryId: insertedQuery.id, reused: false };
  }
);

/**
 * Daily Webset Search (parent) - Cron fan-out: gets companies, fires one child event per company
 */
export const dailyWebsetSearch = inngest.createFunction(
  {
    id: 'daily-webset-search',
    name: 'Daily Webset Search',
  },
  { cron: '0 9 * * *' }, // 9 AM every day
  async ({ step, logger }) => {
    const supabase = getSupabase();

    const companies = await step.run('get-companies', async () => {
      const { data } = await supabase.from('companies').select('id, name').eq('system_enabled', true);
      return data || [];
    });

    logger.info(`Fanning out to ${companies.length} companies`);

    if (companies.length > 0) {
      await step.run('fan-out', () =>
        inngest.send(
          companies.map((c) => ({
            name: 'autogtm/daily-webset.run-company',
            data: { companyId: c.id, companyName: c.name },
          }))
        )
      );
    }

    return { companiesProcessed: companies.length };
  }
);

/**
 * Run company webset search (child) - One query per company, no retries to avoid burning Exa credits
 */
export const runCompanyWebsetSearch = inngest.createFunction(
  {
    id: 'run-company-webset-search',
    name: 'Run Company Webset Search',
    retries: 0,
  },
  { event: 'autogtm/daily-webset.run-company' },
  async ({ event, step, logger }) => {
    const { companyId, companyName } = event.data;
    const supabase = getSupabase();

    const queryToRun = await step.run('find-query', async () => {
      const { data: queries } = await supabase
        .from('exa_queries')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!queries || queries.length === 0) return null;
      return queries[0];
    });

    if (!queryToRun) {
      logger.info(`No pending queries for ${companyName ?? companyId}`);
      return { skipped: true };
    }

    logger.info(`Running query for ${companyName ?? companyId}: "${queryToRun.query}"`);

    await step.run('mark-running', async () => {
      await supabase.from('exa_queries').update({ status: 'running' }).eq('id', queryToRun.id);
    });

    const websetId = await step.run('create-webset', async () => {
      const exa = getExaClient();
      const websetParams: any = {
        search: {
          query: queryToRun.query,
          count: 25,
        },
        enrichments: [
          { description: 'Find the email address for this person or creator', format: 'email' },
          { description: 'Extract the follower or subscriber count if visible', format: 'number' },
        ],
      };
      if (queryToRun.criteria && queryToRun.criteria.length > 0) {
        websetParams.search.criteria = queryToRun.criteria.map((c: string) => ({ description: c }));
      }
      const webset = await exa.websets.create(websetParams);
      return webset.id;
    });

    await step.run('dispatch-webset', async () => {
      const { data: websetRun } = await supabase
        .from('webset_runs')
        .insert({
          query_id: queryToRun.id,
          webset_id: websetId,
          status: 'running',
          items_found: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      await inngest.send({
        name: 'autogtm/webset.created',
        data: {
          queryId: queryToRun.id,
          websetId,
          websetRunId: websetRun?.id,
        },
      });
    });

    return { companyId, queryId: queryToRun.id, websetId };
  }
);

/**
 * Daily Digest - Sends daily summary email
 */
export const dailyDigest = inngest.createFunction(
  {
    id: 'daily-digest',
    name: 'Daily Digest',
  },
  { cron: '0 18 * * *' }, // 6 PM every day
  async ({ step, logger }) => {
    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const todayLeads = await step.run('get-today-leads', async () => {
      return getLeadsByDateRange(`${today}T00:00:00Z`, `${today}T23:59:59Z`);
    });

    // Get campaign stats from Instantly
    const campaigns = await step.run('get-campaigns', async () => {
      const supabase = getSupabase();
      const { data: allCampaigns } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      const stats = { sent: 0, opens: 0, replies: 0 };

      for (const campaign of (allCampaigns || [])) {
        try {
          const analytics = await getCampaignAnalytics(campaign.instantly_campaign_id);
          stats.sent += analytics.sent;
          stats.opens += analytics.opened;
          stats.replies += analytics.replied;

          // Update campaign stats in DB
          await updateCampaignStats(campaign.id, {
            emails_sent: analytics.sent,
            opens: analytics.opened,
            replies: analytics.replied,
          });
        } catch (e) {
          logger.error(`Failed to get analytics for campaign ${campaign.id}:`, e);
        }
      }

      return stats;
    });

    // Send digest email
    await step.run('send-digest', async () => {
      const recipients = process.env.DIGEST_RECIPIENTS?.split(',').filter(Boolean) || [];
      if (recipients.length === 0) return;

      const leadsWithEmail = todayLeads.filter((l) => l.email).length;

      await getResend().emails.send({
        from: process.env.DIGEST_FROM_EMAIL || 'autogtm <noreply@example.com>',
        to: recipients,
        subject: `autogtm Daily Digest - ${today}`,
        html: `
          <h1>autogtm Daily Digest</h1>
          <p>Here's your daily summary for ${today}:</p>
          
          <h2>Leads</h2>
          <ul>
            <li><strong>${todayLeads.length}</strong> new leads discovered</li>
            <li><strong>${leadsWithEmail}</strong> with verified emails</li>
          </ul>
          
          <h2>Campaigns</h2>
          <ul>
            <li><strong>${campaigns.sent}</strong> emails sent</li>
            <li><strong>${campaigns.opens}</strong> opens</li>
            <li><strong>${campaigns.replies}</strong> replies</li>
          </ul>
          
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3200'}">View Dashboard</a></p>
        `,
      });

      logger.info('Daily digest sent');
    });

    return {
      date: today,
      leadsFound: todayLeads.length,
      emailsSent: campaigns.sent,
      opens: campaigns.opens,
      replies: campaigns.replies,
    };
  }
);

/**
 * Sync Campaign Analytics - Runs every hour to update stats
 */
export const syncCampaignAnalytics = inngest.createFunction(
  {
    id: 'sync-campaign-analytics',
    name: 'Sync Campaign Analytics',
  },
  { cron: '0 * * * *' }, // Every hour
  async ({ step, logger }) => {
    const supabase = getSupabase();

    const campaigns = await step.run('get-live-campaigns', async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .not('instantly_campaign_id', 'is', null)
        .in('status', ['draft', 'active', 'paused', 'completed']);
      return data || [];
    });

    let updated = 0;
    for (const campaign of campaigns) {
      await step.run(`sync-campaign-${campaign.id}`, async () => {
        try {
          const instantlyCampaign = await getCampaign(campaign.instantly_campaign_id);
          const nextStatus = mapInstantlyCampaignStatus(instantlyCampaign.status);

          if (nextStatus !== campaign.status) {
            await supabase
              .from('campaigns')
              .update({ status: nextStatus, updated_at: new Date().toISOString() })
              .eq('id', campaign.id);
            logger.info(`Campaign ${campaign.id} status synced: ${campaign.status} -> ${nextStatus}`);
          }

          if (nextStatus === 'active') {
            const analytics = await getCampaignAnalytics(campaign.instantly_campaign_id);
            await updateCampaignStats(campaign.id, {
              emails_sent: analytics.sent,
              opens: analytics.opened,
              replies: analytics.replied,
            });
          }
          updated++;
        } catch (e) {
          logger.error(`Failed to sync campaign ${campaign.id}:`, e);
        }
      });
    }

    return { campaignsUpdated: updated };
  }
);

// Helper function to detect platform from URL
function detectPlatform(url: string): string | null {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('tiktok.com')) return 'tiktok';
  if (urlLower.includes('instagram.com')) return 'instagram';
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
  if (urlLower.includes('linkedin.com')) return 'linkedin';
  return null;
}

/**
 * Enrich Lead - AI-powered lead enrichment using OpenAI web search
 * Triggered when a new lead is created
 */
export const enrichLeadJob = inngest.createFunction(
  {
    id: 'enrich-lead',
    name: 'Enrich Lead',
    retries: 2,
    concurrency: {
      limit: 3, // Only 3 concurrent enrichments to avoid rate limits
    },
  },
  { event: 'autogtm/lead.created' },
  async ({ event, step, logger }) => {
    const { leadId, leadUrl, leadEmail, leadName, companyId } = event.data;
    const supabase = getSupabase();

    // Check system enabled
    const systemOn = await step.run('check-system', () => isSystemEnabled(supabase, companyId));
    if (!systemOn) {
      logger.info(`System disabled for company ${companyId}, skipping enrichment`);
      return { skipped: true };
    }

    logger.info(`Enriching lead ${leadId}`);

    // Mark as enriching
    await supabase
      .from('leads')
      .update({ enrichment_status: 'enriching' })
      .eq('id', leadId);

    // Get company context
    const company = await step.run('get-company', async () => {
      const { data } = await supabase
        .from('companies')
        .select('name, description, target_audience, sending_emails, default_sequence_length, email_prompt, auto_add_enabled, auto_add_min_fit_score')
        .eq('id', companyId)
        .single();
      return data;
    });

    if (!company) {
      logger.error(`Company ${companyId} not found`);
      await supabase
        .from('leads')
        .update({ enrichment_status: 'failed' })
        .eq('id', leadId);
      throw new Error(`Company ${companyId} not found`);
    }

    // Run AI enrichment - dump all raw data, let the model figure it out
    const enrichedData = await step.run('enrich-with-ai', async () => {
      const { data: leadRow } = await supabase.from('leads').select('*').eq('id', leadId).single();
      return enrichLead(
        leadRow || { url: leadUrl, email: leadEmail, name: leadName },
        { name: company.name, description: company.description, targetAudience: company.target_audience },
      );
    });

    // Resolve email: use existing > enrichment agent found > AI extract from Exa data
    const resolvedEmail = await step.run('resolve-email', async () => {
      if (leadEmail) return leadEmail;
      if (enrichedData.email) return enrichedData.email;
      
      // Try AI extraction from Exa enrichment_data
      const { data: leadData } = await supabase.from('leads').select('enrichment_data').eq('id', leadId).single();
      if (leadData?.enrichment_data) {
        const extracted = await extractEmailFromEnrichmentData(leadData.enrichment_data);
        if (extracted) return extracted;
      }
      return null;
    });

    // Update lead with enriched data + resolved email
    await step.run('update-lead', async () => {
      const updateData: Record<string, any> = {
        category: enrichedData.category,
        full_name: enrichedData.full_name,
        title: enrichedData.title,
        bio: enrichedData.bio,
        expertise: enrichedData.expertise,
        social_links: enrichedData.social_links,
        total_audience: enrichedData.total_audience,
        content_types: enrichedData.content_types,
        promotion_fit_score: enrichedData.promotion_fit_score,
        promotion_fit_reason: enrichedData.promotion_fit_reason,
        enrichment_status: 'enriched',
        enriched_at: new Date().toISOString(),
      };
      if (resolvedEmail && !leadEmail) {
        updateData.email = resolvedEmail;
      }
      const { error } = await supabase.from('leads').update(updateData).eq('id', leadId);
      if (error) {
        logger.error(`Failed to update lead ${leadId}:`, error);
        throw error;
      }
    });

    logger.info(`Enriched lead ${leadId}: ${enrichedData.full_name} (${enrichedData.category}) email: ${resolvedEmail || 'none'}`);

    // Auto-skip if still no email after all attempts
    if (!resolvedEmail) {
      await step.run('skip-no-email', () => markLeadSkipped(leadId, 'No email address found'));
      return { leadId, fullName: enrichedData.full_name, category: enrichedData.category, fitScore: enrichedData.promotion_fit_score, routing: { action: 'skipped', reason: 'No email' } };
    }

    // Suggest a campaign for this lead (user will confirm from dashboard)
    const routingDecision = await step.run('decide-campaign', async () => {
      return determineCampaignForLead({
        lead: {
          email: resolvedEmail,
          full_name: enrichedData.full_name,
          category: enrichedData.category,
          platform: detectPlatform(leadUrl || '') || null,
          bio: enrichedData.bio,
          expertise: enrichedData.expertise,
          total_audience: enrichedData.total_audience,
          content_types: enrichedData.content_types,
          promotion_fit_score: enrichedData.promotion_fit_score,
          promotion_fit_reason: enrichedData.promotion_fit_reason,
        },
        campaigns: [],
        company: { name: company.name, description: company.description, target_audience: company.target_audience },
        autoMode: true,
      });
    });

    logger.info(`Routing decision for ${leadId}: ${routingDecision.action} - ${routingDecision.reason}`);

    if (routingDecision.action === 'skip') {
      await step.run('mark-skipped', () => markLeadSkipped(leadId, routingDecision.reason));
      return { leadId, fullName: enrichedData.full_name, category: enrichedData.category, fitScore: enrichedData.promotion_fit_score, routing: { action: 'skipped' } };
    }

    // Create per-lead draft campaign, then set as suggestion.
    const existingDraft = await step.run('get-existing-draft', () => getCampaignBySourceLeadId(leadId));
    const resolvedPrompt = await step.run('resolve-outreach-prompt', () => resolveOutreachPromptForLead({
      supabase,
      companyId,
      leadId,
      companyEmailPrompt: company.email_prompt,
    }));
    logger.info(`Prompt resolution for ${leadId}: ${resolvedPrompt.source}`);
    const campaign = existingDraft || await step.run('create-draft-campaign', () =>
      createDraftCampaignForLead({
        company: { id: companyId, name: company.name, description: company.description, target_audience: company.target_audience, sending_emails: company.sending_emails, default_sequence_length: company.default_sequence_length, email_prompt: company.email_prompt },
        resolvedEmailPrompt: resolvedPrompt.prompt,
        suggestedName: routingDecision.suggestedName,
        suggestedPersona: routingDecision.suggestedPersona,
        leadId,
        leadFullName: enrichedData.full_name,
        leadBio: enrichedData.bio,
        leadCategory: enrichedData.category,
      })
    );
    const suggestedCampaignId = campaign.id;

    await step.run('set-suggested-campaign', () =>
      setSuggestedCampaign(leadId, suggestedCampaignId, routingDecision.reason)
    );

    // Autopilot is intentionally NOT triggered inline here. The daily Auto Add Sweep
    // (`autoAddSweep`) scours the "Ready to Add" backlog once per day and routes the
    // top N qualifying leads, respecting the per-company daily_limit and min_fit_score.
    return { leadId, fullName: enrichedData.full_name, category: enrichedData.category, fitScore: enrichedData.promotion_fit_score, routing: { action: 'suggested', campaignId: suggestedCampaignId } };
  }
);

/**
 * Add Lead to Campaign - Triggered when user confirms adding a lead to its suggested campaign
 * The lead must already have a suggested_campaign_id set by the enrichment flow
 */
export const addLeadToCampaignJob = inngest.createFunction(
  {
    id: 'add-lead-to-campaign',
    name: 'Add Lead to Campaign',
    retries: 2,
    concurrency: { limit: 5 },
  },
  { event: 'autogtm/lead.add-to-campaign' },
  async ({ event, step, logger }) => {
    const { leadId, campaignId } = event.data;
    logger.info(`Adding lead ${leadId} to campaign ${campaignId}`);

    await step.run('route-lead', () => addLeadToCampaignCore({ leadId, campaignId }));

    logger.info(`Lead ${leadId} added to campaign ${campaignId}`);
    return { leadId, campaignId };
  }
);

/**
 * Auto Add Sweep - Scours the "Ready to Add" backlog once per day and routes
 * the top N qualifying leads for each company that has autopilot enabled.
 * Runs at 14:00 UTC (10am ET) — after discovery (09:00) and enrichment have
 * had time to settle on the day's freshest leads.
 */
export const autoAddSweep = inngest.createFunction(
  { id: 'auto-add-sweep', name: 'Auto Add Sweep' },
  { cron: '0 14 * * *' },
  async ({ step, logger }) => {
    const companies = await step.run('list-auto-enabled-companies', () => listAutoEnabledCompanies());
    logger.info(`Autopilot sweep: ${companies.length} enabled companies`);

    if (companies.length === 0) return { companies: 0 };

    await step.sendEvent('fanout-auto-sweep', companies.map((c) => ({
      name: 'autogtm/auto-add.sweep-company' as const,
      data: { companyId: c.id, trigger: 'cron' as const },
    })));

    return { companies: companies.length };
  }
);

/**
 * Auto Add Sweep (per-company) - picks top N leads, routes each via the shared
 * core, aggregates a per-campaign breakdown, writes an audit row and emails a digest.
 */
export const autoAddSweepCompany = inngest.createFunction(
  {
    id: 'auto-add-sweep-company',
    name: 'Auto Add Sweep (Company)',
    concurrency: { key: 'event.data.companyId', limit: 1 },
    retries: 1,
  },
  { event: 'autogtm/auto-add.sweep-company' },
  async ({ event, step, logger }) => {
    const { companyId, trigger } = event.data as { companyId: string; trigger: 'cron' | 'manual' };
    const supabase = getSupabase();

    // Load company + verify autopilot still on (prefs may have flipped between fanout and run)
    const company = await step.run('load-company', async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, name, system_enabled, auto_add_enabled, auto_add_min_fit_score, auto_add_daily_limit, auto_add_digest_email, auto_add_regenerate_drafts')
        .eq('id', companyId)
        .single();
      return data as {
        id: string;
        name: string;
        system_enabled: boolean;
        auto_add_enabled: boolean;
        auto_add_min_fit_score: number;
        auto_add_daily_limit: number;
        auto_add_digest_email: string | null;
        auto_add_regenerate_drafts: boolean;
      } | null;
    });

    if (!company) {
      logger.warn(`Autopilot sweep: company ${companyId} not found`);
      return { skipped: true, reason: 'company_not_found' };
    }
    if (!company.system_enabled) {
      logger.info(`Autopilot sweep: company ${companyId} has System OFF, skipping (even for manual triggers)`);
      return { skipped: true, reason: 'system_disabled' };
    }
    if (!company.auto_add_enabled && trigger === 'cron') {
      logger.info(`Autopilot sweep: company ${companyId} disabled, skipping`);
      return { skipped: true, reason: 'disabled' };
    }

    const minFitScore = company.auto_add_min_fit_score || 7;
    const dailyLimit = company.auto_add_daily_limit ?? 5;
    const regenerateDraftFirst = company.auto_add_regenerate_drafts === true;

    const run = await step.run('create-run', () =>
      createAutoAddRun({ companyId, minFitScore, dailyLimit, trigger })
    );

    if (dailyLimit <= 0) {
      await step.run('complete-run-zero-limit', () =>
        completeAutoAddRun(run.id, { leads_considered: 0, leads_added: 0, leads_skipped: 0, error: null })
      );
      return { runId: run.id, added: 0, reason: 'daily_limit_zero' };
    }

    const candidates = await step.run('fetch-candidates', () =>
      getEligibleLeadsForAutoAdd(companyId, minFitScore, dailyLimit)
    );

    if (candidates.length === 0) {
      await step.run('complete-run-empty', () =>
        completeAutoAddRun(run.id, { leads_considered: 0, leads_added: 0, leads_skipped: 0, error: null })
      );
      logger.info(`Autopilot sweep: company ${companyId} — 0 qualifying leads, skipping digest`);
      return { runId: run.id, added: 0 };
    }

    // Route each lead synchronously so we can collect a breakdown.
    const perCampaign = new Map<string, { count: number; totalScore: number }>();
    const skipReasons: Record<string, number> = {};
    const addedLeadIds: string[] = [];
    const addedLeadSummaries: Array<{ id: string; name: string; score: number; category: string | null; bio: string | null; reason: string | null }> = [];
    let leadsSkipped = 0;
    let regeneratedCount = 0;

    for (const lead of candidates) {
      const result = await step.run(`route-${lead.id}`, async (): Promise<AddLeadToCampaignResult> =>
        addLeadToCampaignCore({
          leadId: lead.id,
          campaignId: lead.suggested_campaign_id,
          softFail: true,
          markSkipped: true,
          regenerateDraftFirst,
        })
      );
      if (result.ok) {
        addedLeadIds.push(lead.id);
        if (result.regenerated) regeneratedCount += 1;
        addedLeadSummaries.push({
          id: lead.id,
          name: lead.full_name,
          score: lead.promotion_fit_score,
          category: lead.category,
          bio: lead.bio,
          reason: lead.suggested_campaign_reason,
        });
        const bucket = perCampaign.get(lead.suggested_campaign_id) || { count: 0, totalScore: 0 };
        bucket.count += 1;
        bucket.totalScore += lead.promotion_fit_score;
        perCampaign.set(lead.suggested_campaign_id, bucket);
      } else {
        leadsSkipped += 1;
        skipReasons[result.reason] = (skipReasons[result.reason] || 0) + 1;
      }
    }

    // Resolve campaign names for the digest breakdown
    const breakdown = await step.run('build-breakdown', async (): Promise<AutoAddRunBreakdownEntry[]> => {
      const ids = Array.from(perCampaign.keys());
      if (ids.length === 0) return [];
      const { data } = await supabase.from('campaigns').select('id, name').in('id', ids);
      const nameById = new Map((data || []).map((c: { id: string; name: string }) => [c.id, c.name]));
      return ids.map((id) => {
        const b = perCampaign.get(id)!;
        return {
          campaignId: id,
          campaignName: nameById.get(id) || 'Unknown campaign',
          count: b.count,
          avgFitScore: Math.round((b.totalScore / b.count) * 10) / 10,
        };
      }).sort((a, b) => b.count - a.count);
    });

    const backlogRemaining = await step.run('count-backlog', () =>
      countReadyToAddLeads(companyId, minFitScore)
    );

    // Send digest email (skip on zero-add days per product decision)
    let digestSent = false;
    let digestError: string | null = null;
    if (addedLeadIds.length > 0) {
      const digestResult = await step.run('send-digest', async () => {
        const envRecipients = process.env.DIGEST_RECIPIENTS?.split(',').map((s) => s.trim()).filter(Boolean) || [];
        const recipients = company.auto_add_digest_email?.trim()
          ? [company.auto_add_digest_email.trim()]
          : envRecipients;
        if (recipients.length === 0) {
          return { sent: false, error: 'no_recipients' };
        }
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3200';
          const subject = `Autopilot · ${company.name} · ${addedLeadIds.length} lead${addedLeadIds.length === 1 ? '' : 's'} added`;
          await getResend().emails.send({
            from: process.env.DIGEST_FROM_EMAIL || 'autogtm <noreply@example.com>',
            to: recipients,
            subject,
            html: renderAutoAddDigestHtml({
              companyName: company.name,
              leadsAdded: addedLeadIds.length,
              leadsSkipped,
              breakdown,
              topLeads: addedLeadSummaries.slice(0, 5),
              skipReasons,
              backlogRemaining,
              minFitScore,
              dailyLimit,
              trigger,
              appUrl,
              regeneratedCount,
            }),
          });
          return { sent: true, error: null as string | null };
        } catch (e) {
          return { sent: false, error: e instanceof Error ? e.message : String(e) };
        }
      });
      digestSent = digestResult.sent;
      digestError = digestResult.error;
    }

    await step.run('complete-run', () =>
      completeAutoAddRun(run.id, {
        leads_considered: candidates.length,
        leads_added: addedLeadIds.length,
        leads_skipped: leadsSkipped,
        breakdown,
        added_lead_ids: addedLeadIds,
        skip_reasons: skipReasons,
        digest_sent: digestSent,
        digest_error: digestError,
      })
    );

    logger.info(`Autopilot sweep: company ${companyId} — added ${addedLeadIds.length}, regenerated ${regeneratedCount}, skipped ${leadsSkipped}, digest=${digestSent}`);
    return {
      runId: run.id,
      companyId,
      considered: candidates.length,
      added: addedLeadIds.length,
      regenerated: regeneratedCount,
      skipped: leadsSkipped,
      digestSent,
    };
  }
);

function renderAutoAddDigestHtml(params: {
  companyName: string;
  leadsAdded: number;
  leadsSkipped: number;
  breakdown: AutoAddRunBreakdownEntry[];
  topLeads: Array<{ id: string; name: string; score: number; category: string | null; bio: string | null; reason: string | null }>;
  skipReasons: Record<string, number>;
  backlogRemaining: number;
  minFitScore: number;
  dailyLimit: number;
  trigger: 'cron' | 'manual';
  appUrl: string;
  regeneratedCount: number;
}): string {
  const { companyName, leadsAdded, leadsSkipped, breakdown, topLeads, skipReasons, backlogRemaining, minFitScore, dailyLimit, trigger, appUrl, regeneratedCount } = params;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const triggerLabel = trigger === 'manual' ? 'Manual run' : 'Daily run';

  const breakdownRows = breakdown.map((b) => `
    <tr>
      <td style="padding:10px 14px;border-top:1px solid #eee;font-size:14px;color:#111;">${esc(b.campaignName)}</td>
      <td style="padding:10px 14px;border-top:1px solid #eee;font-size:14px;color:#111;text-align:right;"><strong>${b.count}</strong></td>
      <td style="padding:10px 14px;border-top:1px solid #eee;font-size:14px;color:#666;text-align:right;">${b.avgFitScore.toFixed(1)}</td>
    </tr>
  `).join('');

  const topLeadsHtml = topLeads.map((l) => `
    <div style="padding:12px 0;border-top:1px solid #eee;">
      <div style="font-size:14px;color:#111;"><strong>${esc(l.name)}</strong> <span style="color:#999;">· fit ${l.score}/10${l.category ? ' · ' + esc(l.category) : ''}</span></div>
      ${l.bio ? `<div style="font-size:13px;color:#555;margin-top:4px;">${esc(l.bio.slice(0, 160))}${l.bio.length > 160 ? '…' : ''}</div>` : ''}
      ${l.reason ? `<div style="font-size:12px;color:#888;margin-top:4px;font-style:italic;">Why: ${esc(l.reason)}</div>` : ''}
    </div>
  `).join('');

  const skipReasonsHtml = Object.keys(skipReasons).length === 0
    ? ''
    : `<div style="margin-top:16px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;color:#9a3412;">
        <strong>Skipped ${leadsSkipped}:</strong>
        ${Object.entries(skipReasons).map(([r, n]) => `${n} × ${esc(r.replace(/_/g, ' '))}`).join(' · ')}
       </div>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border-radius:12px;border:1px solid #eee;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;">
          <div style="font-size:13px;opacity:.9;letter-spacing:.04em;text-transform:uppercase;">Autopilot · ${esc(triggerLabel)}</div>
          <div style="font-size:28px;font-weight:700;margin-top:6px;">${esc(companyName)}</div>
          <div style="font-size:16px;margin-top:10px;opacity:.95;">${leadsAdded} lead${leadsAdded === 1 ? '' : 's'} added to campaigns today</div>
        </div>

        <div style="padding:24px 28px;">
          <h3 style="margin:0 0 12px 0;font-size:14px;color:#666;font-weight:600;letter-spacing:.03em;text-transform:uppercase;">By campaign</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#fafafa;">
                <th style="padding:10px 14px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Campaign</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Added</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Avg fit</th>
              </tr>
            </thead>
            <tbody>${breakdownRows}</tbody>
          </table>

          ${topLeads.length > 0 ? `
            <h3 style="margin:28px 0 8px 0;font-size:14px;color:#666;font-weight:600;letter-spacing:.03em;text-transform:uppercase;">Top picks</h3>
            <div>${topLeadsHtml}</div>
          ` : ''}

          ${skipReasonsHtml}

          ${regeneratedCount > 0 ? `
            <div style="margin-top:16px;padding:12px 14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;font-size:13px;color:#3730a3;">
              Regenerated draft copy for <strong>${regeneratedCount}</strong> lead${regeneratedCount === 1 ? '' : 's'} before sending (fresh per-lead hooks).
            </div>
          ` : ''}

          <div style="margin-top:24px;padding:14px 16px;background:#f9fafb;border-radius:8px;font-size:13px;color:#555;">
            <strong style="color:#111;">${backlogRemaining}</strong> more Ready-to-Add leads in the queue at fit ≥ ${minFitScore}.
            Tomorrow's sweep will process up to ${dailyLimit}.
          </div>

          <div style="margin-top:24px;text-align:center;">
            <a href="${esc(appUrl)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View Dashboard</a>
          </div>
        </div>

        <div style="padding:16px 28px;border-top:1px solid #eee;font-size:12px;color:#999;">
          autogtm Autopilot · ${esc(companyName)}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

// Export all functions
export const functions = [
  processWebsetRun,
  enrichLeadJob,
  addLeadToCampaignJob,
  dailyQueryGeneration,
  generateQueriesOnDemand,
  generateQueryForInstruction,
  dailyWebsetSearch,
  runCompanyWebsetSearch,
  dailyDigest,
  syncCampaignAnalytics,
  autoAddSweep,
  autoAddSweepCompany,
];
