-- ============================================================================
-- Migration 0152 — Prevent Free-plan auto-pause (both projects are on
-- Supabase's Free org plan — confirmed via the Management API). Free
-- projects pause after 7 days of low/no activity, and do NOT resume
-- automatically — someone has to click "Resume project" in the dashboard.
-- For production, that means a real customer-facing outage with no
-- self-healing.
--
-- A pg_cron job running its OWN queries does NOT count as activity that
-- prevents this — confirmed against Supabase's own community discussion on
-- exactly this question (https://github.com/orgs/supabase/discussions/37405).
-- The pause detector only counts genuine external API requests hitting the
-- project (PostgREST/Auth/Storage), and worse, pg_cron itself stops running
-- the moment a project actually pauses — so a purely internal "keep-alive"
-- job is circular and can't recover once triggered.
--
-- Fix: testing and production ping EACH OTHER's real REST API on a
-- schedule, via pg_net (already used in this project for the reminder
-- engines) — from the *target* project's point of view this is a genuine
-- external inbound request, indistinguishable from any real caller,
-- because it physically is one (a separate Supabase project, a separate
-- server, over the real network). Every 2 days, comfortably inside the
-- 7-day window even allowing for a few missed/failed attempts in a row.
--
-- Requires two Vault secrets PER PROJECT, seeded manually (never hardcode
-- a real key into a migration file) — pointing at the OTHER project:
--   select vault.create_secret('https://OTHER-PROJECT-REF.supabase.co', 'peer_project_url');
--   select vault.create_secret('OTHER_PROJECTS_ANON_KEY', 'peer_anon_key');
-- (On testing: peer = production's URL/anon key. On production: peer =
-- testing's. Anon keys only — same "meant to be public, RLS is the real
-- boundary" posture as every anon key already embedded in the frontend
-- bundle; nothing privileged is exchanged here.)
--
-- This is a stopgap, not a substitute for the real fix — confirmed with
-- the user directly: hold off on the Pro plan until the org has real
-- paying/active usage to justify it, use this in the meantime. Upgrading
-- either project to Pro removes it from Free-plan pausing entirely; this
-- migration becomes a no-op (harmless) once that happens, not something
-- that needs to be undone.
-- ============================================================================

create or replace function public.ping_peer_project()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  peer_url text;
  peer_key text;
begin
  select decrypted_secret into peer_url from vault.decrypted_secrets where name = 'peer_project_url' limit 1;
  select decrypted_secret into peer_key from vault.decrypted_secrets where name = 'peer_anon_key' limit 1;
  if peer_url is null or peer_key is null then
    return;
  end if;
  -- REST root — a real, cheap, always-valid PostgREST endpoint (just
  -- returns the OpenAPI listing), no table-level grants needed.
  perform net.http_get(
    url := peer_url || '/rest/v1/',
    headers := jsonb_build_object('apikey', peer_key)
  );
end;
$$;

select cron.schedule('ping-peer-project', '0 3 */2 * *', $$select public.ping_peer_project();$$);
