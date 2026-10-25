-- ============================================================
-- Precleared compliance check (optional, off by default)
-- Per-company settings for the pre-send check, a hold marker the Autopilot
-- tab reads, the receipt id on each cleared lead, and a 30-day cache of
-- verdicts. Safe to run multiple times (guarded with IF NOT EXISTS).
-- ============================================================

-- Settings on companies (the check is off until precleared_enabled is true)
alter table companies
  add column if not exists precleared_enabled boolean not null default false,
  add column if not exists precleared_sender_country text not null default 'GB',
  add column if not exists precleared_address_source text not null default 'unknown',
  add column if not exists precleared_prospect_country text,
  add column if not exists precleared_last_hold jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_precleared_sender_country_chk') then
    alter table companies add constraint companies_precleared_sender_country_chk
      check (precleared_sender_country in ('GB', 'US', 'AE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_precleared_address_source_chk') then
    alter table companies add constraint companies_precleared_address_source_chk
      check (precleared_address_source in ('published', 'bought', 'scraped', 'given', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_precleared_prospect_country_chk') then
    alter table companies add constraint companies_precleared_prospect_country_chk
      check (precleared_prospect_country is null or precleared_prospect_country ~ '^[A-Z]{2}$');
  end if;
end$$;

-- Receipt for the check that cleared a lead for cold email
alter table leads
  add column if not exists precleared_receipt_id text,
  add column if not exists precleared_checked_at timestamptz;

-- Cache of definite verdicts, one row per address and set of inputs
-- (sender country, address source, pitch, prospect country). `unknown` is never cached.
create table if not exists precleared_checks (
  email text not null,
  inputs_hash text not null,
  verdict text not null check (verdict in ('ok_to_email', 'consent_needed', 'blocked')),
  reason text,
  next_step text,
  receipt_id text,
  recipient_country text,
  checked_at timestamptz not null default now(),
  primary key (email, inputs_hash)
);

alter table precleared_checks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'precleared_checks' and policyname = 'Authenticated users can manage precleared_checks'
  ) then
    create policy "Authenticated users can manage precleared_checks"
      on precleared_checks for all using (auth.role() = 'authenticated');
  end if;
end$$;
