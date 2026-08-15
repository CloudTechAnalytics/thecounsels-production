-- ============================================================================
-- Migration 0082 — HR & People Management, Part 7: Employee Onboarding.
--
-- Genuinely integrated with the existing Tasks module, not a parallel
-- checklist system — each onboarding template item becomes a real row in
-- public.tasks (assigned to the new employee, their manager, or HR,
-- depending on the item), so it shows up in that person's normal task
-- list/dashboard/notifications exactly like any other task. Progress
-- ("6/9 completed") is just counting linked tasks by status, via
-- onboarding_task_links — no separate completion-tracking to keep in sync.
-- ============================================================================

create table public.onboarding_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  -- [{ "label": "Employment contract signed", "assignee": "employee" }, ...]
  -- assignee is one of 'employee' | 'manager' | 'hr' (resolved to a real
  -- user_id at assignment time in assign_onboarding() below).
  items           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.onboarding_templates enable row level security;
create policy "onboarding_templates_select" on public.onboarding_templates
  for select using (public.has_permission(organization_id, 'onboarding.manage'));
create policy "onboarding_templates_write" on public.onboarding_templates
  for all using (public.has_permission(organization_id, 'onboarding.manage'))
  with check (public.has_permission(organization_id, 'onboarding.manage'));

create table public.employee_onboarding (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  template_id     uuid not null references public.onboarding_templates(id) on delete restrict,
  assigned_by     uuid references public.profiles(id) on delete set null,
  assigned_at     timestamptz not null default now()
);
alter table public.employee_onboarding enable row level security;
create policy "employee_onboarding_select" on public.employee_onboarding
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'onboarding.manage'));
-- No insert/update policy — assign_onboarding() is the only way one of these is created.

create table public.onboarding_task_links (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  employee_onboarding_id uuid not null references public.employee_onboarding(id) on delete cascade,
  task_id               uuid not null references public.tasks(id) on delete cascade
);
alter table public.onboarding_task_links enable row level security;
create policy "onboarding_task_links_select" on public.onboarding_task_links
  for select using (
    exists (
      select 1 from public.employee_onboarding eo
      where eo.id = employee_onboarding_id
        and (eo.user_id = auth.uid() or public.has_permission(eo.organization_id, 'onboarding.manage'))
    )
  );

create or replace function public.assign_onboarding(p_org uuid, p_user uuid, p_template uuid)
returns public.employee_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  eo public.employee_onboarding;
  v_manager uuid;
  v_item jsonb;
  v_assignee_hint text;
  v_assignee uuid;
  v_task_id uuid;
begin
  if not public.has_permission(p_org, 'onboarding.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select manager_id into v_manager from public.staff_profiles where organization_id = p_org and user_id = p_user;

  insert into public.employee_onboarding (organization_id, user_id, template_id, assigned_by)
  values (p_org, p_user, p_template, auth.uid())
  returning * into eo;

  for v_item in select * from jsonb_array_elements((select items from public.onboarding_templates where id = p_template))
  loop
    v_assignee_hint := coalesce(v_item ->> 'assignee', 'employee');
    v_assignee := case
      when v_assignee_hint = 'manager' and v_manager is not null then v_manager
      when v_assignee_hint = 'hr' then auth.uid()
      else p_user
    end;

    insert into public.tasks (organization_id, title, status, priority, assignee_id, created_by)
    values (p_org, coalesce(v_item ->> 'label', 'Onboarding task'), 'todo', 'medium', v_assignee, auth.uid())
    returning id into v_task_id;

    insert into public.onboarding_task_links (organization_id, employee_onboarding_id, task_id)
    values (p_org, eo.id, v_task_id);
  end loop;

  perform public.log_audit(p_org, 'onboarding.assigned', 'employee_onboarding', eo.id,
    'Onboarding checklist assigned', jsonb_build_object('template_id', p_template, 'user_id', p_user));

  perform public.notify_user(p_org, p_user, auth.uid(), 'hr', 'onboarding.assigned',
    'employee_onboarding', eo.id, 'Your onboarding checklist is ready', 'info');

  return eo;
end;
$$;

grant execute on function public.assign_onboarding(uuid, uuid, uuid) to authenticated;
