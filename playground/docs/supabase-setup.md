# Supabase Setup (realtime, persistence & share links)

The playground runs fully offline by default. The optional **Supabase** integration adds three things:

1. **Realtime**: change events written by one client appear live in others.
2. **Scenario persistence**: "Save scenario" stores a snapshot in Postgres.
3. **Share links**: "Copy Share Link" returns a `?scenario=<uuid>` URL that reloads that snapshot.

## Configuration

`window.PLAYGROUND_CFG` in [`index.html`](../index.html) drives everything:

| Field | Notes |
| --- | --- |
| `supabaseUrl` | `https://<project-ref>.supabase.co` |
| `supabaseKey` | The **publishable** key (`sb_publishable_...`). Public by design: it ships in the page, and row-level security is the access control. Never put a `service_role` / secret key here. |
| `shareBaseUrl` | Base URL used when generating share links. |

If either Supabase field is missing, or the backend does not answer (project paused, offline), the app stays fully offline and does not open a realtime socket.

No CORS configuration is needed: Supabase's API accepts browser requests from any origin.

## Schema

The playground uses the dedicated `letstalkcdc` Supabase project. The assistant-feedback table for the main site lives there too. Apply this SQL (also the applied migration `playground_and_feedback_schema`):

```sql
-- Realtime event stream (public, insert-only for anon)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  ts_ms bigint not null,
  op text not null check (op in ('c','r','u','d')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  constraint events_size check (
    coalesce(pg_column_size(before), 0) + coalesce(pg_column_size(after), 0) < 200000
  )
);
alter table public.events enable row level security;
create policy "anon can read events" on public.events for select to anon, authenticated using (true);
create policy "anon can insert events" on public.events for insert to anon, authenticated with check (true);
alter publication supabase_realtime add table public.events;

-- Saved scenarios: insert-only; no table reads. Shared by unguessable uuid via RPC.
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'scenario' check (kind = 'scenario'),
  version integer not null default 2,
  saved_at timestamptz not null default now(),
  payload jsonb not null,
  constraint scenarios_size check (pg_column_size(payload) < 1000000)
);
alter table public.scenarios enable row level security;
create policy "anon can insert scenarios" on public.scenarios for insert to anon, authenticated with check (true);

create or replace function public.get_scenario(p_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select to_jsonb(s) from public.scenarios s where s.id = p_id;
$$;
revoke all on function public.get_scenario(uuid) from public;
grant execute on function public.get_scenario(uuid) to anon, authenticated;
```

### Design notes

- **`events`** is a public demo stream: anyone can read and append (that is what realtime sync means), capped at ~200 KB per row. `before`/`after` are `jsonb`, so rows are stored as real JSON.
- **`scenarios`** cannot be listed or scanned by clients. A snapshot is readable only by someone who has its UUID, via `get_scenario`. The Supabase security advisor flags this function as publicly executable; that is intentional (it is the share-link lookup).
- Saves are **immutable snapshots**: each save inserts a new row with a client-generated UUID, so a link you already shared never changes. There are no UPDATE/DELETE policies for anon.
- The nested snapshot (`schema`, `rows`, `events`, `comparator`, ...) lives in `payload jsonb`; Postgres has no typed-scalar limitation, which also fixes the old "Cloud save failed" error.
- **Abuse trade-off:** anonymous inserts are open. For a public demo that is acceptable; row-size caps limit the damage. If it is abused, add a rate limit (e.g. an Edge Function or a trigger-based per-IP throttle) or require anonymous sign-in.

## Retention

Both tables are pruned to 30 days by two `pg_cron` jobs (applied 2026-10-09, recorded in the repo-root `supabase/schema.sql`; times are UTC):

| Job                              | Schedule     | Deletes                                                           |
| -------------------------------- | ------------ | ----------------------------------------------------------------- |
| `playground-events-retention`    | `23 3 * * *` | `public.events` rows with `created_at` older than 30 days         |
| `playground-scenarios-retention` | `29 3 * * *` | `public.scenarios` rows with `saved_at` older than 30 days        |

The jobs run once a day, so a row can live up to about 31 days. A share link stops working once its scenario row is deleted. The playground shows a "use made-up data only" note beside the row editor and the change feed, and `/privacy/` describes the same policy.

## Verifying

1. Open the page; the console should show no backend warnings.
2. Insert a row in the UI, then confirm a new row in `public.events`.
3. In a second tab, run an insert in the SQL editor; the event should appear live in the first tab.
4. Click **Copy Share Link**, open the link in a fresh tab: "Scenario loaded from share link."
