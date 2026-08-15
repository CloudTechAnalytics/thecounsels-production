-- ============================================================================
-- Migration 0074 — Two audit-log correctness fixes found during UAT.
--
-- 1. "Someone" instead of a real name in Recent Activity: several Edge
--    Functions call log_audit() through the SERVICE-ROLE client (admin-
--    create-user, summarize-matter) — auth.uid() is always null in that
--    context, even though the function already knows exactly who the real
--    caller is (it authenticated them earlier via the caller-scoped
--    client). log_audit() gains an optional p_actor_id override so those
--    call sites can pass the real person through instead of losing their
--    identity. paystack-webhook's own log_audit calls are left as-is —
--    those genuinely have no human actor (Paystack triggered them), so a
--    null actor there is correct, not a bug.
--
-- 2. Platform admins could see every organization's ENTIRE internal audit
--    trail (matters created, clients added, everything) at all times, not
--    just their own platform-level actions — audit_select's `is_platform_
--    admin() or (...)` was a blanket bypass with no session scoping at all.
--    The app already has real, tracked Support Sessions (0017) for exactly
--    this — a platform admin should only see a firm's internal activity
--    while genuinely inside an active, audited support session for that
--    firm, the same way a human support agent would only see what they're
--    actively working on. Rewritten so has_permission()/is_org_admin()
--    (which both have their own internal is_platform_admin() bypass — see
--    0002) are never even evaluated for a platform admin, closing that
--    loophole rather than papering over it.
-- ============================================================================

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false,
  p_actor_id uuid default null
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.audit_logs;
begin
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata, is_platform_action)
  values (p_org, coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid) to authenticated;

drop policy if exists "audit_select" on public.audit_logs;

create policy "audit_select" on public.audit_logs
  for select using (
    (
      public.is_platform_admin()
      and (
        is_platform_action
        or exists (
          select 1 from public.support_sessions ss
          where ss.organization_id = audit_logs.organization_id
            and ss.admin_id = auth.uid()
            and ss.ended_at is null
            and ss.expires_at > now()
        )
      )
    )
    or (
      not public.is_platform_admin()
      and not is_platform_action
      and (
        actor_id = auth.uid()
        or public.is_org_admin(organization_id)
        or public.has_permission(organization_id, 'audit.read')
      )
    )
  );
