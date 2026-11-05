-- ============================================================================
-- Migration 0186 — colleagues' branch assignments are visible inside a branch.
--
-- member_branches_select only let a non-admin read their OWN rows. The staff
-- roster, lawyer pickers and similar lists decide "is this colleague in my
-- branch?" from the colleague's member_branches rows — which a Lagos
-- associate couldn't read, so a Lagos-only Managing Partner vanished from
-- Lagos staff's Lawyers & Staff page. Now a member can also read any
-- assignment to a branch they themselves have access to: Lagos sees Lagos,
-- still not Abuja (an org-wide member already saw everything).
-- ============================================================================

drop policy if exists member_branches_select on public.member_branches;
create policy member_branches_select on public.member_branches
  for select using (
    public.has_permission(organization_id, 'branches.manage')
    or public.is_org_admin(organization_id)
    or exists (
      select 1 from public.memberships m
      where m.id = member_branches.membership_id and m.user_id = auth.uid()
    )
    or (public.is_org_member(organization_id) and public.user_has_branch_access(organization_id, branch_id))
  );
