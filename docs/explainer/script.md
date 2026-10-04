# autogtm product demo — narration

Screen recording of the live app at autogtm.app, company **Castmenow**. Every screen and number shown is real account data. The walkthrough is read-only: the brief composer is cancelled before submitting, and no campaign, Autopilot, or System control is clicked. Email addresses on screen are blurred.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:01 | Dashboard, Context tab; cursor passes over Context, Searches, Leads, Campaigns, Autopilot | This is autogtm, running live for Castmenow. You describe who you want to reach. It finds them, writes a campaign for each one, and sends it through Instantly. |
| 0:11 | Context → Company Profile expanded, then Lead Briefs | The input lives in Context. The company profile says what Castmenow sells, and to whom. Lead briefs narrow it down, like actors in the UK, for a launch there. |
| 0:21 | Add Brief composer: Queue and Run now (cancelled, not submitted) | A new brief can wait for the 9 AM scheduled run. Or, Run now generates the search and starts it immediately. |
| 0:28 | Searches tab, Exploration tags | Each brief becomes a query, run as an Exa webset. On days with no new briefs, the model writes an exploration query on a fresh angle instead. |
| 0:37 | Leads tab, 9/10 fit scores, Ready to Add filter | Leads are what came back. Each one is enriched with a title, a bio, and a fit score out of ten. Ready to Add means a draft campaign is already waiting. |
| 0:46 | Lead detail: Promotion Fit Score, Campaign Workspace, Create and Start | Open one. On the left, why she scored a nine. On the right, the draft sequence, written for this person. Create and Start builds the campaign in Instantly, and adds the lead. |
| 0:56 | Campaigns tab, completed campaigns with Instantly links | Started campaigns land here. Status and stats sync back from Instantly every hour. |
| 1:02 | Autopilot tab: toggle, daily rule, recent runs; System ON | Or let Autopilot do that step. Every morning, the sweep takes the top Ready to Add leads above your fit threshold, up to a daily limit, sends them, and emails you a digest. These are its real past runs. And System ON, up top, is the master switch. |

## What each line maps to in the code

- Queue vs Run now: `POST /api/companies/[id]/updates` with `mode: 'queue' | 'run_now'`. Queued briefs are picked up by `dailyQueryGeneration` (cron `30 8 * * *`) and run by `dailyWebsetSearch` (cron `0 9 * * *`). Run now fires `autogtm/queries.generate-for-instruction`, then `startQueryRun` creates the Exa webset.
- Exploration queries: `generateExplorationQuery` in `packages/autogtm-core/src/ai/generateDailyQuery.ts`, used when a company has no unprocessed briefs.
- Enrichment and fit score: `enrichLeadJob` → `enrichLead` (`promotion_fit_score`, `promotion_fit_reason`), then `determineCampaignForLead` and `createDraftCampaignForLead` produce the per-lead draft.
- Create and Start: `POST /api/leads/[id]/route-to-campaign` → `addLeadToCampaignJob` → `addLeadToCampaignCore` → `sendDraftCampaignForLead`, which creates and activates the Instantly campaign, then adds the lead.
- Hourly sync: `syncCampaignAnalytics` (cron `0 * * * *`).
- Autopilot: `autoAddSweep` (cron `0 14 * * *`, 10 AM ET) → `autoAddSweepCompany` → `getEligibleLeadsForAutoAdd` → `addLeadToCampaignCore`, then a Resend digest.
