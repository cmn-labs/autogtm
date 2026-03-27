<p align="center">
  <img src="apps/autogtm/src/app/icon.svg" width="64" height="64" alt="autogtm logo" />
</p>

<h1 align="center">autogtm</h1>

<p align="center">
  <strong>Cold outbound on autopilot.</strong><br/>
  Open-source go-to-market engine powered by AI.
</p>

<p align="center">
  Describe your target audience in plain English. AutoGTM discovers leads daily, enriches them with AI, creates tailored email campaigns, and sends via Instantly. System on, autopilot on, you sleep.
</p>

---

## How it works

1. **You add instructions** in plain English.
2. **Choose execution mode per instruction**:
   - `Queue`: picked up by scheduled generation/run.
   - `Run now`: generates and starts search immediately.
3. **AI generates search queries** from instruction context.
4. **Exa runs search and extracts leads** with enrichment hints.
5. **AI enriches leads** (bio, fit score, contact context).
6. **AI creates a draft campaign per lead** for review.
7. **You review and start**, or **Autopilot** starts for high-fit leads when enabled.
8. **Instantly status + analytics sync hourly**; digest summary is sent at 6 PM.

### Controls

| Toggle | What it does |
|---|---|
| **System ON/OFF** | Master switch. When OFF, nothing runs. No searches, no enrichment, no campaigns. |
| **Autopilot ON/OFF** | When ON, high-fit leads (score 7+) are auto-started. When OFF, you review manually. |

### Daily schedule

| Time | What happens |
|---|---|
| 8:30 AM | Generate queued search queries from instructions |
| 9:00 AM | Run searches, discover and enrich leads |
| Hourly | Sync campaign status and analytics from Instantly |
| 6:00 PM | Send daily digest email |

---

## Features

- **AI lead discovery:** Exa.ai websets find people matching your natural-language description.
- **AI enrichment:** Bio, social links, audience size, expertise tags, and a 1-10 fit score with reasoning.
- **AI email copywriting:** Personalized multi-step sequences generated per lead draft.
- **Campaign management:** Draft-first campaigns with controlled start in Instantly.ai.
- **System + Autopilot toggles:** Company-level controls for full automation and auto-start behavior.
- **Exploration mode:** When no new instructions exist, AI generates creative queries to keep pipeline coverage fresh.
- **Daily digest:** Summary email with leads found, emails sent, opens, and replies.
- **Multi-company:** Manage multiple company profiles from a single dashboard.

## Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Frontend | React 19, [Tailwind CSS](https://tailwindcss.com), [Radix UI](https://radix-ui.com) |
| Database + Auth | [Supabase](https://supabase.com) (PostgreSQL + Auth) |
| Background Jobs | [Inngest](https://inngest.com) |
| Lead Discovery | [Exa.ai](https://exa.ai) (Websets API) |
| Email Sending | [Instantly.ai](https://instantly.ai) |
| AI | [OpenAI](https://openai.com) (GPT-4.1 / GPT-5-mini) |
| Digest Emails | [Resend](https://resend.com) |

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

<details>
<summary><strong>Supabase Setup</strong></summary>

Create a new Supabase project at [supabase.com](https://supabase.com), then:

1. Open your project dashboard
2. Go to **SQL Editor**
3. Paste the contents of [`schema.sql`](./schema.sql) and run it

This creates all required tables, indexes, RLS policies, and helper functions.

</details>

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
