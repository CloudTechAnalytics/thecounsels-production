-- ============================================================================
-- Migration 0137 — Branch-scoped members no longer see the whole firm
-- roster in Firm Settings > Members.
--
-- Deliberately NOT an RLS change on memberships_select — that policy stays
-- exactly as broad as it is today ("any active member of the org"), on
-- purpose: administration.service.ts's listMembers() backs BOTH the Firm
-- Settings roster AND the "New message" recipient picker (useFirmMembers,
-- shared by new-dm-dialog.tsx). Per the conversation this was fixed in,
-- messaging deliberately stays firm-wide — its own dialog copy already
-- promises "anyone in your firm," a Slack-style choice, not a bug. Tightening
-- the shared RLS policy would have silently broken that at the same time.
--
-- So this narrows only where it was actually asked for: a new RPC the
-- Members panel calls to get the *set of membership ids it's allowed to
-- show*, filtered client-side on top of the existing (unchanged, still
-- broad) query — an application-level narrowing for one specific screen,
-- not a security boundary. Staff directory visibility isn't privileged
-- client data the way matter/document access is; this is an information-
-- architecture choice for one page, correctly scoped as one instead of
-- reused as a blanket RLS policy that would reach further than intended.
--
-- can_view_membership() mirrors matter_row_access's own shape: admins and
-- org-scope targets (leadership with access_scope = 'organization') stay
-- visible to everyone; everyone else is narrowed to sharing a branch.
-- ============================================================================

create or replace function public.can_view_membership(p_org uuid, p_membership_id uuid, p_target_access_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(p_org) and (
    public.is_org_admin(p_org)
    or p_target_access_scope = 'organization'
    or exists (
      select 1 from public.member_branches mb
      where mb.membership_id = p_membership_id
        and public.user_has_branch_access(p_org, mb.branch_id)
    )
  );
$$;

create or replace function public.list_visible_membership_ids(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.memberships m
  where m.organization_id = p_org
    and public.can_view_membership(p_org, m.id, m.access_scope);
$$;

grant execute on function public.list_visible_membership_ids(uuid) to authenticated;
