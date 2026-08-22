-- ============================================================================
-- Migration 0114 — matters.branch_id + cross-branch sharing + the branch
-- OR-bypass on has_matter_access()/matter_row_access().
--
-- branch_id is nullable at the DB level (never NOT NULL — a constraint that
-- could brick an insert path we didn't anticipate), but the application
-- always populates it going forward: the creating user's own branch when
-- their access_scope is 'branch', or the org's head office when they hold
-- organization-wide scope and didn't pick one explicitly. Existing matters
-- backfill to their org's Head Office branch (created in 0112) below.
--
-- has_matter_access()/matter_row_access() get exactly ONE new OR-branch
-- added to their existing bypass list — never a new AND. Every existing
-- bypass (is_org_admin, matters.view_all, lead_lawyer_id, created_by, a
-- matter_assignments row) keeps meaning exactly what it already meant;
-- branch access becomes one more alternative way in. Because every existing
-- membership defaults to access_scope='organization' (0113), and
-- user_has_branch_access() always returns true for that scope, this change
-- is a strict no-op for every current user until an admin deliberately
-- narrows someone's scope.
--
-- matter_row_access() picks up branch_id as a 5th DIRECT PARAMETER, not a
-- self-lookup against `matters` — re-querying matters from inside its own
-- policy is exactly the self-referential-RLS-on-INSERT...RETURNING bug 0034
-- fixed. Because the argument count changes, the old 4-arg signature is
-- explicitly DROPPED before the 5-arg version is created — the same
-- discipline 0087 established for log_audit() — and matters_select/update/
-- delete are updated in this same migration to pass branch_id through.
--
-- matter_branch_shares mirrors matter_assignments' exact shape (0030):
-- explicit, per-branch, admin-granted visibility for a matter whose primary
-- branch is elsewhere. Default is branch isolation; sharing is opt-in.
--
-- time_entries/expenses/invoices/payments need NO migration here — their
-- RLS already gates matter-linked rows through has_matter_access(matter_id)
-- (0045/0048/0049/0050), so redefining that one function below gives all
-- four branch-awareness automatically.
-- ============================================================================

alter table public.matters
  add column branch_id uuid references public.branches(id) on delete set null;

create index idx_matters_branch on public.matters (branch_id) where branch_id is not null;

update public.matters m
set branch_id = hq.id
from public.branches hq
where m.branch_id is null
  and hq.organization_id = m.organization_id
  and hq.is_head_office;

create table public.matter_branch_shares (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  shared_by       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (matter_id, branch_id)
);

create index idx_matter_branch_shares_matter on public.matter_branch_shares (matter_id);
create index idx_matter_branch_shares_branch on public.matter_branch_shares (branch_id);

alter table public.matter_branch_shares enable row level security;

create policy "matter_branch_shares_select" on public.matter_branch_shares
  for select using (public.has_matter_access(matter_id));

create policy "matter_branch_shares_insert" on public.matter_branch_shares
  for insert with check (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

create policy "matter_branch_shares_delete" on public.matter_branch_shares
  for delete using (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

-- ----------------------------------------------------------------------------
-- has_matter_access — same signature, safe create-or-replace (matches 0031's
-- own precedent of replacing this function in place without touching
-- matters_select).
-- ----------------------------------------------------------------------------
create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matters m
    where m.id = p_matter
      and public.has_permission(m.organization_id, 'matters.view')
      and (
        public.is_org_admin(m.organization_id)
        or public.has_permission(m.organization_id, 'matters.view_all')
        or m.lead_lawyer_id = auth.uid()
        or m.created_by = auth.uid()
        or exists (select 1 from public.matter_assignments ma where ma.matter_id = m.id and ma.user_id = auth.uid())
        or public.user_has_branch_access(m.organization_id, m.branch_id)
        or exists (
          select 1 from public.matter_branch_shares mbs
          where mbs.matter_id = m.id and public.user_has_branch_access(m.organization_id, mbs.branch_id)
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- matter_row_access — argument count changes (4 -> 5), so the old signature
-- is explicitly dropped first (see header note above). The three matters
-- policies that call it must be dropped BEFORE the function itself (a
-- dependent-object error otherwise: policies matters_select/update/delete
-- all reference matter_row_access(uuid,uuid,uuid,uuid) directly), then
-- recreated afterward against the new 5-arg signature.
-- ----------------------------------------------------------------------------
drop policy if exists "matters_select" on public.matters;
drop policy if exists "matters_update" on public.matters;
drop policy if exists "matters_delete" on public.matters;

drop function if exists public.matter_row_access(uuid, uuid, uuid, uuid);

create or replace function public.matter_row_access(p_org uuid, p_lead_lawyer uuid, p_created_by uuid, p_matter uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_admin(p_org)
      or public.has_permission(p_org, 'matters.view_all')
      or p_lead_lawyer = auth.uid()
      or p_created_by = auth.uid()
      or exists (select 1 from public.matter_assignments ma where ma.matter_id = p_matter and ma.user_id = auth.uid())
      or public.user_has_branch_access(p_org, p_branch_id)
      or exists (
        select 1 from public.matter_branch_shares mbs
        where mbs.matter_id = p_matter and public.user_has_branch_access(p_org, mbs.branch_id)
      )
    );
$$;

grant execute on function public.matter_row_access(uuid, uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists "matters_select" on public.matters;
create policy "matters_select" on public.matters
  for select using (public.matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id));

drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id)
    and status not in ('closed', 'won', 'lost')
  )
  with check (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id)
  );

drop policy if exists "matters_delete" on public.matters;
create policy "matters_delete" on public.matters
  for delete using (
    public.has_permission(organization_id, 'matters.delete')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id)
  );
