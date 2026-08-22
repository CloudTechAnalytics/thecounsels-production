-- ============================================================================
-- Migration 0113 — access_scope on memberships + member_branches, and the
-- matching access_scope/branch fields on the invitations pre-acceptance flow.
--
-- access_scope answers "WHERE can this user see/act", orthogonal to role
-- (which answers "WHAT can they do"). Default 'organization' for every
-- existing membership is deliberate and load-bearing: it reproduces today's
-- actual behaviour exactly (no branch concept existed before this, so every
-- current user effectively had full-org reach) for every row that exists
-- right now. Nobody's access narrows as a side effect of this migration —
-- only a membership an admin *deliberately* re-scopes to 'branch' or
-- 'multiple_branches' afterwards becomes branch-restricted.
--
-- 'branch' and 'multiple_branches' are two labels for the exact same
-- enforcement mechanism (member_branches rows) — one row vs. several is a
-- UI-only distinction (single-select vs multi-select picker), never a SQL
-- one. 'personal' scope gets no rows here and no special-case SQL anywhere
-- else — it simply never satisfies the org-wide-or-branch-match check added
-- in 0114-0116, so it falls through to whichever individual-assignment
-- bypass already exists per table (lead_lawyer_id/created_by/
-- matter_assignments for matters, assignee_id/created_by for tasks,
-- user_id for staff_profiles) — zero new code needed for that to compose.
-- ============================================================================

alter table public.memberships
  add column access_scope text not null default 'organization'
    check (access_scope in ('organization', 'branch', 'multiple_branches', 'personal'));

create table public.member_branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id   uuid not null references public.memberships(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (membership_id, branch_id)
);

create index idx_member_branches_membership on public.member_branches (membership_id);
create index idx_member_branches_branch on public.member_branches (branch_id);

alter table public.member_branches enable row level security;

-- Admins see every assignment in the org; anyone else can only see their OWN
-- membership's branch assignments (needed so a branch-scoped user's own
-- client can compute "which branches am I in" for the dashboard selector).
create policy "member_branches_select" on public.member_branches
  for select using (
    public.has_permission(organization_id, 'branches.manage')
    or public.is_org_admin(organization_id)
    or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid())
  );

create policy "member_branches_write" on public.member_branches
  for all using (public.has_permission(organization_id, 'branches.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission(organization_id, 'branches.manage') or public.is_org_admin(organization_id));

-- ----------------------------------------------------------------------------
-- user_has_branch_access(p_org, p_branch_id) — the one new SECURITY DEFINER
-- helper every branch-scoped table policy in 0114-0116 consults. Mirrors
-- has_permission()'s exact shape/style (0002).
--
-- p_branch_id IS NULL returns TRUE unconditionally — the only choice
-- consistent with "nothing gets more restrictive": every real row is
-- backfilled to a branch by the migration that adds branch_id to it, so a
-- null here only ever happens on a genuinely untouched edge case.
-- ----------------------------------------------------------------------------
create or replace function public.user_has_branch_access(p_org uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_branch_id is null
    or public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.organization_id = p_org and m.status = 'active' and m.access_scope = 'organization'
    )
    or exists (
      select 1
      from public.memberships m
      join public.member_branches mb on mb.membership_id = m.id
      where m.user_id = auth.uid() and m.organization_id = p_org and m.status = 'active' and mb.branch_id = p_branch_id
    );
$$;

grant execute on function public.user_has_branch_access(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- invitations — the second (email, pre-account) invite path alongside
-- admin-create-user, kept in sync with the same "Role + Access Scope +
-- Branch(es)" shape even though no current frontend component renders this
-- flow's form (admin-create-user / CreateUserDialog is the live path) —
-- keeping the RPC/schema in sync now is cheap and avoids a second drift
-- point later.
-- ----------------------------------------------------------------------------
alter table public.invitations
  add column access_scope text not null default 'organization'
    check (access_scope in ('organization', 'branch', 'multiple_branches', 'personal'));

create table public.invitation_branches (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete cascade,
  unique (invitation_id, branch_id)
);
alter table public.invitation_branches enable row level security;

create policy "invitation_branches_select" on public.invitation_branches
  for select using (
    exists (select 1 from public.invitations i where i.id = invitation_id and public.is_org_admin(i.organization_id))
  );
create policy "invitation_branches_write" on public.invitation_branches
  for all using (
    exists (select 1 from public.invitations i where i.id = invitation_id and public.is_org_admin(i.organization_id))
  )
  with check (
    exists (select 1 from public.invitations i where i.id = invitation_id and public.is_org_admin(i.organization_id))
  );

-- accept_invitation() keeps its exact 1-argument signature (p_token uuid) —
-- CREATE OR REPLACE is safe here, no overload risk. Full original body
-- (0054) preserved verbatim, with access_scope propagated into the new
-- membership and invitation_branches copied into member_branches.
create or replace function public.accept_invitation(p_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
  me_email citext;
  mem public.memberships;
begin
  select email into me_email from public.profiles where id = auth.uid();
  if me_email is null then
    raise exception 'No authenticated profile' using errcode = '42501';
  end if;

  select * into inv from public.invitations where token = p_token;
  if inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer valid' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;
  if lower(inv.email) <> lower(me_email) then
    raise exception 'Invitation was issued to a different email' using errcode = '42501';
  end if;
  if not public.can_add_member(inv.organization_id) then
    raise exception 'Seat limit reached for this organization''s plan' using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status, invited_by, invited_at, joined_at, access_scope)
  values (inv.organization_id, auth.uid(), inv.role_id, 'active', inv.invited_by, inv.created_at, now(), coalesce(inv.access_scope, 'organization'))
  on conflict (organization_id, user_id)
    do update set status = 'active', role_id = excluded.role_id, access_scope = excluded.access_scope
  returning * into mem;

  insert into public.member_branches (organization_id, membership_id, branch_id, assigned_by)
  select inv.organization_id, mem.id, ib.branch_id, inv.invited_by
  from public.invitation_branches ib
  where ib.invitation_id = inv.id
  on conflict (membership_id, branch_id) do nothing;

  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  update public.profiles
    set default_organization_id = coalesce(default_organization_id, inv.organization_id)
    where id = auth.uid();

  perform public.log_audit(inv.organization_id, 'invitation.accepted', 'membership', mem.id,
    'User accepted invitation', jsonb_build_object('email', me_email));

  return mem;
end;
$$;
