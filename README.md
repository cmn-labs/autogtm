

# autogtm

**autogtm is an open-source AI GTM engine that runs cold outbound on autopilot.**

Describe your target audience in plain English with optional targeted briefs, and autogtm discovers leads daily, enriches them with AI, creates tailored email campaigns, and sends via Instantly. System on, autopilot on, you sleep.

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
| **Autopilot ON/OFF** | When ON, every day at 10am ET the top N Ready-to-Add leads (configurable fit-score threshold + daily limit) are auto-added to their suggested campaigns and a digest email is sent summarizing the run. Configure in the Autopilot tab. |


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

If you already have a Supabase project from an earlier version, apply incremental migrations from `[migrations/](./migrations/)` instead — they're safe to re-run (`IF NOT EXISTS` guarded).



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