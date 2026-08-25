-- ============================================================================
-- Migration 0120 — Client error logs (no-vendor error monitoring).
--
-- Sentry wiring (src/app/sentry.ts) stays in the codebase but needs a paid-
-- capable account + DSN to actually send anything, and that's off the table
-- for now. This gives error visibility with zero third-party signup: every
-- uncaught render error (ErrorBoundary) and every uncaught script/promise
-- error (window 'error'/'unhandledrejection', registered once in
-- src/shared/lib/error-log.ts) gets a best-effort insert here. Sentry.
-- captureException() is still called alongside it — if a DSN gets added
-- later, both fire from the same call site with no further wiring.
--
-- Deliberately simple: insert-only from the client, no update/delete, no
-- foreign key onto auth.users. Both organization_id and user_id are
-- nullable and INSERT is open to the anon role as well as authenticated —
-- some of the real bugs this app has shipped (stale-session login
-- redirects, a race sending a just-logged-in user back to the landing
-- page) happen exactly in that logged-out/mid-auth window, and they're
-- worth catching too. The trade-off: this is a public write endpoint like
-- any anon-key insert in this app, so length caps below bound the worst
-- case of a spammed row rather than trying to rate-limit it. Readable only
-- by platform admins — this is an internal ops tool, not firm-facing data.
-- ============================================================================

create table public.client_error_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete set null,
  user_id          uuid references public.profiles(id) on delete set null,
  message          text not null check (char_length(message) <= 2000),
  stack            text check (stack is null or char_length(stack) <= 8000),
  component_stack  text check (component_stack is null or char_length(component_stack) <= 8000),
  url              text check (url is null or char_length(url) <= 2000),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 500),
  environment      text,
  context          jsonb,
  created_at       timestamptz not null default now()
);

create index client_error_logs_created_at_idx on public.client_error_logs (created_at desc);
create index client_error_logs_org_idx on public.client_error_logs (organization_id);

alter table public.client_error_logs enable row level security;

create policy "client_error_logs_insert" on public.client_error_logs
  for insert to anon, authenticated
  with check (true);

-- Platform admins only — matches the Audit Logs / System Health pattern of
-- ops-facing tables nobody at a firm needs to see.
create policy "client_error_logs_select" on public.client_error_logs
  for select using (public.is_platform_admin());

grant insert on public.client_error_logs to anon, authenticated;
grant select on public.client_error_logs to authenticated;
