-- ============================================================================
-- Migration 0138 — Partner is branch-isolated, same as everyone else.
--
-- Reported: an Abuja-branch Partner could see a Lagos-only matter (and,
-- as a direct consequence, that matter's client too — clients_select's
-- own EXISTS clause routes through has_matter_access). Root cause was
-- two independent bypasses stacking:
--
--   1. Partner held matters.view_all directly — the explicit "see every
--      matter regardless of branch" grant. Correct for Managing Partner
--      (whose firm-wide oversight IS the point of the role); Partner
--      inherited the full permission catalog at seed time, effectively
--      making it indistinguishable from Managing Partner.
--   2. matter_row_access's own "sees everything" bypass was
--      is_org_admin(p_org) — which returns true for ANYONE holding
--      members.manage, not just the firm's actual owner. Partner (and,
--      incidentally, platform staff) holds members.manage for
--      legitimate reasons (staff administration), but that permission
--      was also silently granting blanket case-content visibility as a
--      side effect — the same anti-pattern already fixed twice this
--      session (0125, 0126), just via a different function.
--
-- Checked the actual blast radius before touching the shared function:
-- only platform_owner, platform_admin, managing_partner, partner, and
-- it_administrator hold members.manage. Platform staff are unaffected
-- (is_platform_admin() stays as its own explicit bypass). Managing
-- Partner is unaffected (matters.view_all is their own direct grant,
-- independent of this bypass). IT Administrator is unaffected (it
-- deliberately lacks matters.view entirely, so it never reaches this
-- branch regardless). This narrows behavior for exactly one role: Partner.
--
-- Fix: matter_row_access's blanket bypass now checks real ownership
-- (memberships.is_owner) instead of the broader is_org_admin(); Partner
-- loses matters.view_all, falling back to the same personal-connection +
-- branch rule (or explicit multi-branch access_scope) everyone else
-- follows. has_matter_access/has_task_access/documents_select/
-- hearings_select/appointments_select all route through this same
-- function, so the fix reaches all of them at once — same reasoning
-- as 0125's own comment on why matter_row_access is the right layer.
-- ============================================================================

create or replace function public.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.organization_id = p_org and m.status = 'active' and m.is_owner = true
    );
$$;

create or replace function public.matter_row_access(p_org uuid, p_lead_lawyer uuid, p_created_by uuid, p_matter uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_owner(p_org)
      or public.has_permission(p_org, 'matters.view_all')
      or (
        (
          p_lead_lawyer = auth.uid()
          or p_created_by = auth.uid()
          or exists (select 1 from public.matter_assignments ma where ma.matter_id = p_matter and ma.user_id = auth.uid())
        )
        and (
          public.user_has_branch_access(p_org, p_branch_id)
          or exists (
            select 1 from public.matter_branch_shares mbs
            where mbs.matter_id = p_matter and public.user_has_branch_access(p_org, mbs.branch_id)
          )
        )
      )
    );
$function$;

delete from public.role_permissions
where role_id = (select id from public.roles where key = 'partner')
  and permission_id = (select id from public.permissions where key = 'matters.view_all');
