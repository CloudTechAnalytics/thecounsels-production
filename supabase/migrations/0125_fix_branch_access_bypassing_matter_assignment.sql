-- ============================================================================
-- Migration 0125 — Branch access was silently overriding matter removal.
--
-- has_matter_access() and matter_row_access() (the matters table's own RLS,
-- kept as a separate parametrized copy to dodge a self-referential-query
-- issue on that table — see 0034's own comment) both OR'd
-- user_has_branch_access(org, branch_id) in as an INDEPENDENT grant,
-- alongside lead_lawyer/created_by/matter_assignments.
--
-- user_has_branch_access() returns true unconditionally for any membership
-- with access_scope = 'organization' — which is the DEFAULT every
-- membership got from the branch migrations (0113) and stays at unless an
-- admin deliberately narrows it. So for the overwhelming majority of real
-- memberships, that OR-branch alone was enough to see every matter in the
-- org regardless of matter_assignments — removing someone from a matter
-- (unassignMember) still deleted their matter_assignments row correctly,
-- it just never mattered: this branch clause kept granting access anyway.
-- Exactly the reported symptom — add to a matter, get the notification;
-- remove, keep the access — and a real regression against the matter-level
-- access control this app already has a P1 fix for (migration 0030).
--
-- Fix: branch access is now a NARROWING condition on the personal-
-- connection grounds (lead/creator/assigned), not an independent grant.
-- is_org_admin/matters.view_all are untouched — those are meant to stay
-- org-wide regardless of branch, same as before. A plain fee-earner now
-- needs to be personally connected to a matter (assigned to it, its lead,
-- or its creator) AND have branch access to it — matching exactly how
-- matter_row_access/has_matter_access behaved before the branch
-- architecture was added, with branch scoping now correctly layered on
-- top rather than bypassing it.
-- ============================================================================

create or replace function public.matter_row_access(p_org uuid, p_lead_lawyer uuid, p_created_by uuid, p_matter uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_admin(p_org)
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

create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.matters m
    where m.id = p_matter
      and public.matter_row_access(m.organization_id, m.lead_lawyer_id, m.created_by, m.id, m.branch_id)
  );
$function$;
