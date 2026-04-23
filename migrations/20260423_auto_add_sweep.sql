-- ============================================================
-- Auto Add Sweep — daily scheduled autopilot
-- Adds preference columns to companies and an audit table for sweep runs.
-- Safe to run multiple times (guarded with IF NOT EXISTS).
-- ============================================================

-- Preference columns on companies
alter table companies
  add column if not exists auto_add_daily_limit integer not null default 5,
  add column if not exists auto_add_run_hour_utc integer not null default 14,
  add column if not exists auto_add_digest_email text,
  add column if not exists auto_add_regenerate_drafts boolean not null default false;

-- Constrain sanity
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_auto_add_daily_limit_chk') then
    alter table companies add constraint companies_auto_add_daily_limit_chk
      check (auto_add_daily_limit between 0 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_auto_add_run_hour_utc_chk') then
    alter table companies add constraint companies_auto_add_run_hour_utc_chk
      check (auto_add_run_hour_utc between 0 and 23);
  end if;
end$$;

-- Audit + digest history table
create table if not exists auto_add_runs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  run_started_at timestamptz not null default now(),
  run_completed_at timestamptz,
  leads_considered integer not null default 0,
  leads_added integer not null default 0,
  leads_skipped integer not null default 0,
  min_fit_score integer not null,
  daily_limit integer not null,
  breakdown jsonb not null default '[]'::jsonb,
  added_lead_ids uuid[] not null default '{}',
  skip_reasons jsonb not null default '{}'::jsonb,
  digest_sent boolean not null default false,
  digest_error text,
  error text,
  trigger text not null default 'cron'
);

create index if not exists auto_add_runs_company_started_idx
  on auto_add_runs(company_id, run_started_at desc);
