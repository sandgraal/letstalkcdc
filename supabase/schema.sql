-- Let's Talk CDC: schema for assistant 👍/👎 feedback.
--
-- Supabase project ref: veagqeduouwapbfvpsfj (letstalkcdc, us-east-1)
--
-- This file is a reviewable, idempotent record of the DESIRED schema. It is
-- NOT applied automatically by CI or by the build. Run it by hand in the
-- Supabase dashboard (SQL editor) if you ever need to recreate the table.
--
-- Scope: public.assistant_feedback, plus the retention jobs for the
-- playground's `events` and `scenarios` tables in the same project (the
-- tables themselves belong to the playground work and are intentionally not
-- described here).
--
-- Access model: the browser posts to the PostgREST endpoint with the
-- PUBLISHABLE key (role `anon`). That role may INSERT and nothing else.
-- There is no anon read policy; the maintainer reads rows in the Supabase
-- dashboard. Never put a secret / service-role key in this repo.

create table if not exists public.assistant_feedback (
  -- The browser supplies its own id so a retried request is idempotent
  -- (a duplicate insert returns HTTP 409, which the client treats as stored).
  -- The default only applies to rows inserted by other means.
  id        uuid primary key default gen_random_uuid(),
  question  text        not null check (char_length(question) <= 2000),
  intent_id text                 check (char_length(intent_id) <= 200),
  helpful   boolean     not null,
  ts        timestamptz not null default now()
);

alter table public.assistant_feedback enable row level security;

-- Insert-only policy for the browser roles. Guarded so re-running is safe.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'assistant_feedback'
      and policyname = 'anon can insert feedback'
  ) then
    create policy "anon can insert feedback"
      on public.assistant_feedback
      for insert
      to anon, authenticated
      with check (true);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Least privilege (APPLIED to the live database on 2026-10-09 UTC)
--
-- This is the applied state, not a proposal. The two statements below were
-- run against the live project on 2026-10-09 (UTC, migration version 20261009024217) as the migration
-- `assistant_feedback_least_privilege`. After them, anon and authenticated
-- hold INSERT on public.assistant_feedback and nothing else. Re-running this
-- file is safe: revoke and grant are idempotent.
-- ---------------------------------------------------------------------------
revoke all on public.assistant_feedback from anon, authenticated;
grant insert on public.assistant_feedback to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention: delete feedback older than 12 months (APPLIED 2026-10-09 UTC)
--
-- This is the applied state, not a proposal. It was run against the live
-- project as the migration `assistant_feedback_retention_12_months`
-- (version 20261009032147, 2026-10-09 03:21 UTC). The job runs daily at
-- 03:17 UTC. Re-running this block is safe: the extension create is
-- guarded and any existing job of the same name is unscheduled first.
-- Scope: public.assistant_feedback only. The playground tables (events,
-- scenarios) have their own 30-day jobs, recorded in the next block.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'assistant-feedback-retention';

select cron.schedule(
  'assistant-feedback-retention',
  '17 3 * * *',
  $$delete from public.assistant_feedback where ts < now() - interval '12 months'$$
);

-- ---------------------------------------------------------------------------
-- Retention: delete playground events and saved scenarios older than 30 days
-- (APPLIED 2026-10-09 UTC; decision D9, plan item P15-24)
--
-- This is the applied state, not a proposal. Both jobs exist on the live
-- project (pg_cron) and run daily in UTC: events at 03:23, scenarios at
-- 03:29. Because they run once a day, a row can live for up to about 31
-- days, and a shared scenario link stops working once its row is deleted.
-- The playground tables are created and governed by the playground's own
-- setup (playground/docs/supabase-setup.md); only the retention jobs are
-- recorded here. `events` ages by created_at, `scenarios` by saved_at.
-- Re-running this block is safe: the extension create is guarded and any
-- existing job of the same name is unscheduled first.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname in ('playground-events-retention', 'playground-scenarios-retention');

select cron.schedule(
  'playground-events-retention',
  '23 3 * * *',
  $$delete from public.events where created_at < now() - interval '30 days'$$
);

select cron.schedule(
  'playground-scenarios-retention',
  '29 3 * * *',
  $$delete from public.scenarios where saved_at < now() - interval '30 days'$$
);
