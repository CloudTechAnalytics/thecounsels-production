-- ============================================================================
-- Migration 0084 — HR & People Management: seed sensible defaults, and let
-- announcements target by role.
--
-- 1. Leave types and departments were never seeded anywhere — new orgs got
--    empty dropdowns with no way to fill them in (no UI existed either).
--    A trigger seeds sensible defaults on every future organization
--    (self-service registration, platform-admin manual creation — every
--    path, not just one), and a one-time backfill does the same for orgs
--    that already exist. Everything seeded is fully editable/deletable —
--    these are starting points, not fixed values (never hardcode
--    entitlements, per the module's own instruction).
--
-- 2. hr_announcements.audience_type gains 'role' — targeting "everyone
--    with role X" needs no setup (roles already exist), unlike
--    departments which a firm has to configure first.
-- ============================================================================

create or replace function public.seed_hr_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leave_types (organization_id, name, default_entitlement_days) values
    (new.id, 'Annual Leave', 20),
    (new.id, 'Sick Leave', 10),
    (new.id, 'Casual Leave', 5),
    (new.id, 'Maternity Leave', 90),
    (new.id, 'Paternity Leave', 10),
    (new.id, 'Compassionate Leave', 5),
    (new.id, 'Study Leave', 10),
    (new.id, 'Exam Leave', 5)
  on conflict (organization_id, name) do nothing;

  insert into public.departments (organization_id, name) values
    (new.id, 'Corporate'),
    (new.id, 'Litigation'),
    (new.id, 'Family'),
    (new.id, 'Real Estate'),
    (new.id, 'Finance'),
    (new.id, 'Administration'),
    (new.id, 'Human Resources'),
    (new.id, 'IT')
  on conflict (organization_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_hr_defaults on public.organizations;
create trigger trg_seed_hr_defaults
  after insert on public.organizations
  for each row execute function public.seed_hr_defaults();

-- One-time backfill for organizations that already exist.
insert into public.leave_types (organization_id, name, default_entitlement_days)
select o.id, v.name, v.days
from public.organizations o
cross join (values
  ('Annual Leave', 20), ('Sick Leave', 10), ('Casual Leave', 5), ('Maternity Leave', 90),
  ('Paternity Leave', 10), ('Compassionate Leave', 5), ('Study Leave', 10), ('Exam Leave', 5)
) as v(name, days)
on conflict (organization_id, name) do nothing;

insert into public.departments (organization_id, name)
select o.id, v.name
from public.organizations o
cross join (values
  ('Corporate'), ('Litigation'), ('Family'), ('Real Estate'),
  ('Finance'), ('Administration'), ('Human Resources'), ('IT')
) as v(name)
on conflict (organization_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- Announcements: add 'role' as a targetable audience.
-- ----------------------------------------------------------------------------
alter table public.hr_announcements drop constraint if exists hr_announcements_audience_type_check;
alter table public.hr_announcements add constraint hr_announcements_audience_type_check
  check (audience_type in ('organization', 'department', 'employees', 'branch', 'role'));
alter table public.hr_announcements add column if not exists audience_role_key public.role_key;

-- CREATE OR REPLACE only replaces a function whose argument list matches
-- exactly — adding a new parameter here would otherwise leave the OLD
-- 7-argument version in place as a separate overload (dead code the
-- frontend's existing call, which doesn't pass p_role_key, would keep
-- silently hitting instead of this one).
drop function if exists public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text);

create or replace function public.send_hr_announcement(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch text default null,
  p_role_key public.role_key default null
)
returns public.hr_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_announcements;
  recipient record;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, audience_role_key, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, p_role_key, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    left join public.roles r on r.id = m.role_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
        or (p_audience_type = 'role' and r.key = p_role_key)
      )
  loop
    perform public.notify_user(p_org, recipient.user_id, auth.uid(), 'hr', 'hr.announcement',
      'hr_announcement', rec.id, p_title, 'info');
  end loop;

  perform public.log_audit(p_org, 'hr.announcement_sent', 'hr_announcement', rec.id,
    format('Announcement sent: %s', p_title), jsonb_build_object('audience_type', p_audience_type));

  return rec;
end;
$$;

grant execute on function public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text, public.role_key) to authenticated;
