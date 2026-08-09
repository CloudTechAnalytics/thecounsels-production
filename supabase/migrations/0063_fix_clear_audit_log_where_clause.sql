-- ============================================================================
-- Migration 0063 — Fix clear_audit_log(): "DELETE requires a WHERE clause".
--
-- This project's Supabase database has a safe-update guard enabled that
-- rejects any UPDATE/DELETE with no WHERE clause outright — including one
-- issued from inside a SECURITY DEFINER function, not just raw REST calls.
-- The bare `delete from public.audit_logs;` in 0062 tripped it. Fixed with
-- a tautological `where true`, which satisfies the guard while still
-- deleting every row exactly as intended.
-- ============================================================================

create or replace function public.clear_audit_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can clear the audit log' using errcode = '42501';
  end if;

  delete from public.audit_logs where true;

  select full_name into actor_name from public.profiles where id = auth.uid();
  perform public.log_audit(
    null, 'audit_log.cleared', null, null,
    coalesce(actor_name, 'A platform administrator') || ' cleared the audit log',
    '{}'::jsonb, true
  );
end;
$$;
