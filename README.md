

# autogtm

**autogtm is an open-source AI GTM engine that runs cold outbound on autopilot.** ⚡

[![Watch the autogtm product demo](docs/explainer/poster.png)](https://zthpkrurmodfjyzoqmuc.supabase.co/storage/v1/object/public/social-images/demo-video/autogtm-explainer.mp4)

Simply describe your target audience in plain English with optional targeted briefs, and autogtm *discovers leads daily, enriches them with AI, creates tailored email campaigns, and sends via Instantly*. System on, autopilot on, you sleep!

---

## How it works

1. **You set context** — fill in the Company Profile so the AI can search broadly. Optionally add **Lead Briefs** to pinpoint specific kinds of leads ("acting coaches on TikTok with 10k+ followers").
2. **Choose execution mode per brief**:
  - `Queue`: picked up by scheduled generation/run.
  - `Run now`: generates and starts search immediately.
3. **AI generates search queries** from your context + briefs.
4. **Exa runs search and extracts leads** with enrichment hints.
5. **AI enriches leads** (bio, fit score, contact context).
6. **AI creates a draft campaign per lead** for review.
7. **Approve and send** — either you manually review and click "Create and Start Campaign", or **Autopilot** sweeps the backlog daily at 10am ET and sends the top N qualifying leads on its own.
8. **Instantly status + analytics sync hourly**; daily digest summarizes what went out.

### Controls


| Toggle               | What it does                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System ON/OFF**    | Master switch. When OFF, nothing runs. No searches, no enrichment, no campaigns. Turning this off also pauses Autopilot.                                                                                                                |
| **Autopilot ON/OFF** ⚡ | When ON, every day at 10am ET the top N Ready-to-Add leads (configurable fit-score threshold + daily limit) are auto-added to their suggested campaigns and a digest email is sent summarizing the run. Configure in the Autopilot tab. |
| **Compliance check ON/OFF** | Optional, off by default. When ON, each new lead is checked with [Precleared](https://precleared.dev) before it is added to an Instantly campaign, on both the manual path and the Autopilot sweep. Configure in the Autopilot tab. See [Compliance check](#compliance-check-optional-off-by-default). |


### Compliance check (optional, off by default)

Turn on **Compliance check** in a company's Autopilot tab and autogtm asks [Precleared](https://precleared.dev) whether a cold email to each new lead is allowed (UK PECR, US CAN-SPAM, Canada's CASL, Germany's UWG, France, Australia, Ireland, the Netherlands) before the lead is added to an Instantly campaign. It runs once per new lead, inside the shared routing core, so the manual "add to campaign" button, the daily Autopilot sweep and the draft campaign "Activate" button are all covered.

- `ok_to_email`: the lead is added as before and the signed receipt id is stored on the lead (`precleared_receipt_id`).
- `consent_needed`, `blocked` or `unknown`: the lead is not added. It is marked Skipped with `Precleared: <rule> (<source>). <next step>`, so it shows under the Skipped filter and in the Autopilot digest. Once you have fixed the cause (for example set the prospects' country), press Undo on the lead: it goes straight back to Ready to Add and is checked again on the next run.
- If the check cannot be made (daily allowance used up, key out of checks or rejected, Precleared unreachable, or the company's settings could not be loaded), the lead stays in Ready to Add. The Autopilot tab shows what fixes it and the digest says how many leads are waiting. Nothing is sent unchecked and nothing is dropped silently.
- Verdicts are cached for 30 days per address (table `precleared_checks`). Changing the sender country, address source, company description or prospects' country forces a fresh check.

Settings per company: sender country (GB, US or AE), address source (published, bought, scraped, given or unknown; leads found by autogtm are usually published or scraped) and an optional prospects' country. Precleared works out each lead's country from the address, company records or the company's website; if all your leads are in one country, set the prospects' country and it is used when none of those show it. Leads whose country cannot be worked out come back `unknown` and are held.

**What is sent to precleared.dev:** the lead's email address, your sender country, the address source, your company description (first 200 characters, as the pitch) and, if set, the prospects' country. Never the email copy, never the lead's name or bio. Nothing is sent to the lead. The verdict is decision support with sources, not legal advice.

**Free key.** Without a key, Precleared allows 10 checks a day shared by every app on the same network address (on Vercel that includes other people's apps), so a keyless install may hit the limit on day one. Get a free key at https://precleared.dev/get-key and set `PRECLEARED_API_KEY`: 25 checks a day, 100 a day for the first 14 days. With the default Autopilot limit of 5 leads a day per company, a free key covers five companies and the first-14-days allowance covers twenty.

**Existing databases:** run `migrations/20261025_precleared.sql` in the Supabase SQL editor. Until then the check simply stays off.


### Daily schedule


| Time        | What happens                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| 8:30 AM     | Generate queued search queries from briefs and company context                        |
| 9:00 AM     | Run searches, discover and enrich leads                                               |
| 10:00 AM ET | **Autopilot sweep** — auto-add top N Ready-to-Add leads + digest email (when enabled) |
| Hourly      | Sync campaign status and analytics from Instantly                                     |
| 2:00 PM ET  | Send daily discovery digest email                                                     |


---

## Features

- **AI lead discovery:** Exa.ai websets find people matching your natural-language description.
- **AI enrichment:** Bio, social links, audience size, expertise tags, and a 1-10 fit score with reasoning.
- **AI email copywriting:** Personalized multi-step sequences generated per lead draft.
- **Campaign management:** Draft-first campaigns with controlled start in Instantly.ai.
- **System + Autopilot toggles:** Company-level master switch plus a daily Autopilot sweep that auto-adds the top N qualifying leads each morning (configurable daily limit, minimum fit score, and digest email).
- **Fresh-copy Autopilot:** Optional "regenerate draft before adding" — rewrites each draft's sequence against the lead's bio/expertise right before sending so stale templated copy never goes out.
- **Exploration mode:** When no new briefs exist, AI generates creative queries to keep pipeline coverage fresh.
- **Daily digests:** Two summary emails — a per-company Autopilot digest (what was auto-added and to which campaigns) and a global discovery digest (leads found, emails sent, opens, replies).
- **Compliance check (optional):** Ask [Precleared](https://precleared.dev) whether a cold email to each new lead is allowed before it is added to a campaign. Off by default; anything other than `ok_to_email` holds the lead as Skipped with the rule and the next step.
- **Multi-company:** Manage multiple company profiles from a single dashboard.

## Stack


| Layer           | Technology                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Framework       | [Next.js 15](https://nextjs.org) (App Router)                                       |
| Frontend        | React 19, [Tailwind CSS](https://tailwindcss.com), [Radix UI](https://radix-ui.com) |
| Database + Auth | [Supabase](https://supabase.com) (PostgreSQL + Auth)                                |
| Background Jobs | [Inngest](https://inngest.com)                                                      |
| Lead Discovery  | [Exa.ai](https://exa.ai) (Websets API)                                              |
| Email Sending   | [Instantly.ai](https://instantly.ai)                                                |
| AI              | [OpenAI](https://openai.com) (GPT-4.1 / GPT-5-mini)                                 |
| Digest Emails   | [Resend](https://resend.com)                                                        |


---

## Getting Started

### Prerequisites

Accounts needed:

- [Supabase](https://supabase.com) — database and authentication
- [Exa.ai](https://exa.ai) — lead discovery via Websets API
- [Instantly.ai](https://instantly.ai) — email campaign sending
- [OpenAI](https://platform.openai.com) — AI enrichment and generation
- [Inngest](https://inngest.com) — background job scheduling
- [Resend](https://resend.com) — daily digest emails (optional)
- [Precleared](https://precleared.dev) — cold email compliance check (optional; works without an account, free key recommended)

Locally: Node.js 18+ and npm.

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/autogtm.git
cd autogtm
npm install

# Configure environment
cp apps/autogtm/.env.example apps/autogtm/.env.local
# Fill in values in .env.local

# Run
npm run dev
```

The app runs at [http://localhost:3200](http://localhost:3200).

For background jobs, run the Inngest dev server in a separate terminal:

```bash
npx inngest-cli@latest dev
```

**Supabase Setup**

Create a new Supabase project at [supabase.com](https://supabase.com), then:

1. Open your project dashboard
2. Go to **SQL Editor**
3. Paste the contents of `[schema.sql](./schema.sql)` and run it

This creates all required tables, indexes, RLS policies, and helper functions.

If you already have a Supabase project from an earlier version, apply incremental migrations from `[migrations/](./migrations/)` instead — they're safe to re-run (`IF NOT EXISTS` guarded). The optional compliance check needs `migrations/20261025_precleared.sql`.



## Deployment

autogtm is a standard Next.js app. Deploy to any platform that supports it:

- **Vercel** — recommended, zero-config Next.js deployment

Make sure to:

1. Set all environment variables in your hosting platform
2. Connect your Inngest app to receive webhooks at `/api/inngest`
3. Ensure your Supabase project is on a paid plan if you need higher limits

## License

Licensed under [AGPL-3.0](LICENSE).

**TL;DR:** You can use it, change it, and ship it; if you run a modified version as a service (e.g. a hosted app), you must make that version’s source code available to your users.
