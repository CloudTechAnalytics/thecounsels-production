-- ============================================================================
-- Migration 0183 — An employee's branch follows the branch their login is
-- limited to, when HR hasn't set one.
--
-- Found while testing 0182: branch-scoped members (e.g. Abuja-only) had no
-- branch on their employee record, so their fund/leave/HR requests carried
-- no branch and were visible firm-wide — the branch rule had nothing to
-- match. Now:
--   * employees with no branch take their membership's branch when it is
--     exactly one (several branches = HR picks; we don't guess);
--   * that also happens whenever a member is given branch access later;
--   * open requests are re-stamped with the requester's branch.
-- An explicit branch set by HR always wins.
-- ============================================================================

create or replace function public.member_single_branch(p_org uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) = 1 then min(mb.branch_id::text)::uuid end
  from public.memberships m
  join public.member_branches mb on mb.membership_id = m.id
  where m.organization_id = p_org and m.user_id = p_user and m.access_scope <> 'organization';
$$;
revoke execute on function public.member_single_branch(uuid, uuid) from public, anon, authenticated;

create or replace function public.employee_branch(p_org uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select branch_id from public.employees where organization_id = p_org and user_id = p_user),
    (select branch_id from public.staff_profiles where organization_id = p_org and user_id = p_user),
    public.member_single_branch(p_org, p_user)
  );
$$;

update public.employees e
set branch_id = public.member_single_branch(e.organization_id, e.user_id)
where e.branch_id is null and e.user_id is not null
  and public.member_single_branch(e.organization_id, e.user_id) is not null;

create or replace function public.employee_branch_from_member_branches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user from public.memberships where id = new.membership_id;
  update public.employees
  set branch_id = public.member_single_branch(v_org, v_user)
  where organization_id = v_org and user_id = v_user and branch_id is null
    and public.member_single_branch(v_org, v_user) is not null;
  return new;
end;
$$;
drop trigger if exists trg_employee_branch_from_member_branches on public.member_branches;
create trigger trg_employee_branch_from_member_branches
  after insert on public.member_branches
  for each row execute function public.employee_branch_from_member_branches();

-- Requests already raised: stamp the requester's branch where missing.
-- (Runs as the migration owner, so the 0182 branch guard doesn't apply.)
update public.fund_requests fr set branch_id = public.employee_branch(fr.organization_id, fr.user_id)
where fr.branch_id is null and public.employee_branch(fr.organization_id, fr.user_id) is not null;
