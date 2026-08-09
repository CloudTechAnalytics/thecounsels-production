-- ============================================================================
-- Migration 0062 — Let a platform admin clear the audit log.
--
-- audit_logs has never had a delete path — it's append-only by design
-- (0002's own header comment says so). This adds exactly one: a
-- SECURITY DEFINER RPC gated to platform admins, deliberately with no
-- accompanying RLS delete policy, so a raw `supabase.from('audit_logs')
-- .delete()` can never bypass it (same "RPC is the only writer" posture
-- as notification_log/direct_conversations elsewhere in this schema).
--
-- Clearing isn't silent: after the delete, exactly one fresh row is
-- written recording who cleared it and when — the act of clearing the
-- log is itself the one thing that can never be erased from it.
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

  delete from public.audit_logs;

  select full_name into actor_name from public.profiles where id = auth.uid();
  perform public.log_audit(
    null, 'audit_log.cleared', null, null,
    coalesce(actor_name, 'A platform administrator') || ' cleared the audit log',
    '{}'::jsonb, true
  );
end;
$$;

grant execute on function public.clear_audit_log() to authenticated;
