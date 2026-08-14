-- ============================================================================
-- Migration 0083 — HR & People Management, Part 8: HR Announcements.
--
-- Delivery goes through the existing notification infrastructure
-- (notify_user, category 'hr' — added in 0075) rather than a separate
-- system: every recipient gets a normal in-app notification the same way
-- leave/request updates already do. Email/WhatsApp multi-channel fan-out
-- (like the task reminder engine has) is a follow-up, not built here.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('hr_announcements.view', 'hr_announcements', 'view', 'View HR announcements')
on conflict (key) do nothing;

-- Baseline — every firm role can read announcements addressed to them,
-- same reasoning as leave.request/hr_requests.submit in 0076.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'hr_announcements.view'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

create table public.hr_announcements (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  title                  text not null,
  body                   text not null,
  audience_type          text not null default 'organization'
                           check (audience_type in ('organization', 'department', 'employees', 'branch')),
  audience_department_id uuid references public.departments(id) on delete set null,
  audience_user_ids      uuid[] not null default '{}',
  audience_branch        text,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index idx_hr_announcements_org on public.hr_announcements (organization_id, created_at desc);

alter table public.hr_announcements enable row level security;
create policy "hr_announcements_select" on public.hr_announcements
  for select using (public.has_permission(organization_id, 'hr_announcements.view'));
-- No insert policy — send_hr_announcement() is the only way one is created (it also has to fan out notifications atomically with the row).

create or replace function public.send_hr_announcement(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch text default null
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
  if p_audience_type not in ('organization', 'department', 'employees', 'branch') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
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

grant execute on function public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text) to authenticated;
