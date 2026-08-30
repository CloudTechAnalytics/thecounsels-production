-- ============================================================================
-- Migration 0156 — purge_deleted_organizations() was the one lifecycle
-- function in this family (soft_delete/restore/hard_delete/reset_demo all
-- already check is_platform_admin()) with no internal authorization check
-- at all. It's meant to run only from a scheduled job, but as a plain
-- SECURITY DEFINER function it's directly callable via PostgREST RPC by
-- literally anyone — including the unauthenticated anon role. Found during
-- a security review of RLS policies and RPC functions: an anonymous caller
-- could hit POST /rest/v1/rpc/purge_deleted_organizations with no auth at
-- all and permanently purge every org past its 30-day soft-delete grace
-- period, on demand, shortening every org's recovery window to whatever
-- an attacker chose to make it.
-- ============================================================================

create or replace function public.purge_deleted_organizations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can purge deleted organizations' using errcode = '42501';
  end if;

  with removed as (
    delete from public.organizations
    where deleted_at is not null and deleted_at < now() - interval '30 days'
    returning id
  )
  select count(*) into n from removed;
  return n;
end;
$$;
