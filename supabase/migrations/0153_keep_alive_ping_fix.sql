-- ============================================================================
-- Migration 0153 — Fix 0152's ping target, caught immediately via live
-- testing before trusting it: GET /rest/v1/ (PostgREST's bare root/OpenAPI
-- listing) requires the service_role key specifically — an anon key gets a
-- 401 UNAUTHORIZED_INVALID_API_KEY_TYPE, confirmed live with a direct curl
-- against the real endpoint. Switched to a real table query instead
-- (profiles, RLS-scoped so anon genuinely gets 0 rows back — that's fine,
-- the query executing is what matters), which is also a more literal match
-- for what Supabase's own docs describe as counting toward activity
-- ("user queries"/"user database activity") than a bare health check would
-- have been. Confirmed live: both directions now return a clean 200.
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
  perform net.http_get(
    url := peer_url || '/rest/v1/profiles?select=id&limit=1',
    headers := jsonb_build_object('apikey', peer_key, 'Authorization', 'Bearer ' || peer_key)
  );
end;
$$;
