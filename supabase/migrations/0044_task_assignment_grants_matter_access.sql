-- ============================================================================
-- Migration 0044 — Assigning a task grants matter access, notifies, and
-- records both the team addition and the task assignment on the timeline.
--
-- Without this, assigning a task on a matter to someone not already on that
-- matter's team left them with a task they could not see at all (RLS blocks
-- tasks whose matter they don't have access to) — and separately, task
-- assignment never notified anyone regardless of matter access, since it
-- was never wired into the notification system built in 0025/0030.
-- ============================================================================

-- 1. Auto-grant matter access to a task's assignee, reusing the existing
--    matter_assignments table — its own insert/notify/audit triggers
--    (0030) fire automatically, so the "team assignment" half of this is
--    zero new trigger code.
create or replace function public.grant_task_assignee_matter_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead uuid;
  changed boolean;
begin
  if new.assignee_id is null or new.matter_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    changed := true;
  else
    changed := new.assignee_id is distinct from old.assignee_id or new.matter_id is distinct from old.matter_id;
  end if;
  if not changed then
    return new;
  end if;

  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead = new.assignee_id then
    return new; -- already has access as lead lawyer
  end if;

  insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
  values (new.organization_id, new.matter_id, new.assignee_id, auth.uid())
  on conflict (matter_id, user_id) do nothing;

  return new;
end $$;

drop trigger if exists trg_grant_task_assignee_matter_access on public.tasks;
create trigger trg_grant_task_assignee_matter_access
  after insert or update of assignee_id, matter_id on public.tasks
  for each row execute function public.grant_task_assignee_matter_access();

-- 2. Notify the assignee about the task itself (separate from the "you were
--    added to the matter team" notification the trigger above produces).
--    Deep-links to the matter when the task has one — matches how every
--    other matter-scoped notification resolves, since there's no
--    standalone task detail page yet.
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
  end if;

  if assigned and (auth.uid() is null or new.assignee_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(
      new.organization_id, new.assignee_id, auth.uid(), 'tasks', 'task.assigned',
      case when new.matter_id is not null then 'matter' else 'task' end,
      coalesce(new.matter_id, new.id),
      coalesce(actor_name, 'Someone') || ' assigned you a task: ' || new.title,
      'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- 3. Timeline entry for the task assignment itself (matter-linked tasks
--    only — matter_events.matter_id is not nullable). The team-addition
--    half is already recorded automatically by track_matter_assignment_added
--    (0030) once trigger #1 above inserts the matter_assignments row.
create or replace function public.track_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assignee_name text;
  assigned boolean;
begin
  if new.matter_id is null then return new; end if;
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
  end if;
  if not assigned then return new; end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into assignee_name from public.profiles where id = new.assignee_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_assigned',
    coalesce(actor_name, 'Someone') || ' assigned task "' || new.title || '" to ' || coalesce(assignee_name, 'someone'));
  return new;
end $$;

drop trigger if exists trg_track_task_assigned on public.tasks;
create trigger trg_track_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.track_task_assigned();
