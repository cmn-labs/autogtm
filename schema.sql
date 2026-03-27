-- AutoGTM Database Schema
-- Run this in your Supabase SQL Editor to set up the required tables.

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- Companies
-- ============================================================
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  website text not null,
  description text not null default '',
  target_audience text not null default '',
  sending_emails text[] default '{}',
  default_sequence_length integer not null default 2 check (default_sequence_length between 1 and 3),
  email_prompt text,
  auto_add_enabled boolean not null default false,
  auto_add_min_fit_score integer not null default 7,
  agent_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Company Updates (instructions for query generation)
-- ============================================================
create table company_updates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  content text not null,
  query_generated boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Exa Queries
-- ============================================================
create table exa_queries (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  query text not null,
  criteria text[] default '{}',
  is_active boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  last_run_at timestamptz,
  source_instruction_id uuid references company_updates(id) on delete set null,
  generation_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Webset Runs
-- ============================================================
create table webset_runs (
  id uuid primary key default uuid_generate_v4(),
  query_id uuid not null references exa_queries(id) on delete cascade,
  webset_id text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  items_found integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ============================================================
-- Campaigns
-- ============================================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  source_lead_id uuid,
  draft_type text not null default 'lead' check (draft_type in ('lead')),
  instantly_campaign_id text,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  persona text,
  target_criteria jsonb,
  leads_count integer not null default 0,
  emails_sent integer not null default 0,
  opens integer not null default 0,
  replies integer not null default 0,
  is_accepting_leads boolean not null default true,
  max_leads integer not null default 500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Campaign Emails (email copy per step)
-- ============================================================
create table campaign_emails (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step integer not null default 0,
  subject text not null,
  body text not null,
  delay_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index campaigns_source_lead_unique on campaigns(source_lead_id) where source_lead_id is not null;
create unique index campaign_emails_campaign_step_unique on campaign_emails(campaign_id, step);

create table campaign_email_versions (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  version_number integer not null,
  step integer not null default 0,
  subject text not null,
  body text not null,
  delay_days integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index campaign_email_versions_unique_step on campaign_email_versions(campaign_id, version_number, step);
create index campaign_email_versions_campaign_version_idx on campaign_email_versions(campaign_id, version_number desc);

-- ============================================================
-- Leads
-- ============================================================
create table leads (
  id uuid primary key default uuid_generate_v4(),
  query_id uuid not null references exa_queries(id) on delete cascade,
  webset_run_id uuid references webset_runs(id) on delete set null,
  name text,
  email text,
  url text not null,
  platform text,
  follower_count integer,
  enrichment_data jsonb,
  -- Enriched fields
  category text check (category in ('influencer', 'coach', 'blog', 'agency', 'podcast', 'other')),
  full_name text,
  title text,
  bio text,
  expertise text[],
  social_links jsonb,
  total_audience integer,
  content_types text[],
  promotion_fit_score integer check (promotion_fit_score between 1 and 10),
  promotion_fit_reason text,
  enrichment_status text not null default 'pending' check (enrichment_status in ('pending', 'enriching', 'enriched', 'failed')),
  enriched_at timestamptz,
  -- Campaign routing
  suggested_campaign_id uuid references campaigns(id) on delete set null,
  suggested_campaign_reason text,
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_status text not null default 'pending' check (campaign_status in ('pending', 'routed', 'skipped')),
  campaign_routed_at timestamptz,
  skip_reason text,
  created_at timestamptz not null default now()
);

-- Prevent duplicate leads by URL
create unique index leads_url_unique on leads(url);
alter table campaigns add constraint campaigns_source_lead_fkey
  foreign key (source_lead_id) references leads(id) on delete set null;

-- ============================================================
-- Daily Digests
-- ============================================================
create table daily_digests (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  date text not null,
  leads_found integer not null default 0,
  emails_sent integer not null default 0,
  opens integer not null default 0,
  replies integer not null default 0,
  sent_at timestamptz not null default now()
);

-- ============================================================
-- Allowed Users (invite whitelist)
-- ============================================================
create table allowed_users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper function: increment campaign lead count
-- ============================================================
create or replace function increment_campaign_leads(campaign_id_input uuid)
returns void as $$
begin
  update campaigns
  set leads_count = leads_count + 1,
      updated_at = now()
  where id = campaign_id_input;
end;
$$ language plpgsql;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table companies enable row level security;
alter table company_updates enable row level security;
alter table exa_queries enable row level security;
alter table webset_runs enable row level security;
alter table campaigns enable row level security;
alter table campaign_emails enable row level security;
alter table leads enable row level security;
alter table daily_digests enable row level security;
alter table allowed_users enable row level security;

-- Allow authenticated users full access (adjust as needed for your use case)
create policy "Authenticated users can manage companies"
  on companies for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage company_updates"
  on company_updates for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage exa_queries"
  on exa_queries for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage webset_runs"
  on webset_runs for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage campaigns"
  on campaigns for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage campaign_emails"
  on campaign_emails for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage leads"
  on leads for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage daily_digests"
  on daily_digests for all using (auth.role() = 'authenticated');

create policy "Authenticated users can read allowed_users"
  on allowed_users for select using (auth.role() = 'authenticated');
