-- ============================================================================
-- Migration 0058 — Task & Meeting Notification/Reminder Engine, Part B:
-- task lifecycle triggers + timeline entries.
--
-- Builds on 0044's notify_task_assigned()/track_task_assigned() rather than
-- replacing them: they now distinguish a first assignment from a genuine
-- reassignment. A shared notify_task_event() helper is introduced here and
-- reused by every trigger below and by the Part D scheduler (0059) — it
-- writes both the in-app `notifications` row (via notify_user) and a
-- matching `notification_log` IN_APP/SENT row in one call, so in-app events
-- show up in the audit trail too.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- task_notification_priority — maps a task's priority to the notification
-- system's own priority enum, reused everywhere a task-related notification
-- is raised so Urgent/High tasks get the same red/amber visual emphasis in
-- the bell/notifications list that TASK_PRIORITY_META already gives them on
-- every task row (spec §2).
-- ----------------------------------------------------------------------------
create or replace function public.task_notification_priority(p_priority public.task_priority)
returns public.notification_priority
language sql
immutable
as $$
  select case p_priority
    when 'urgent' then 'urgent'::public.notification_priority
    when 'high' then 'warning'::public.notification_priority
    else 'info'::public.notification_priority
  end
$$;

-- ----------------------------------------------------------------------------
-- notify_task_event — the shared fan-out every task trigger (and the Part D
-- scheduler) calls: one in-app notification + one notification_log row.
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_event(
  p_org uuid,
  p_task_id uuid,
  p_matter_id uuid,
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  perform public.notify_user(
    p_org, p_user, p_actor, 'tasks', p_type,
    case when p_matter_id is not null then 'matter' else 'task' end,
    coalesce(p_matter_id, p_task_id),
    p_title, p_priority
  );
  insert into public.notification_log
    (organization_id, user_id, actor_id, task_id, notification_type, channel, status, sent_at)
  values
    (p_org, p_user, p_actor, p_task_id, p_type, 'IN_APP', 'SENT', now());
end;
$$;

-- ----------------------------------------------------------------------------
-- reset_task_reminders_on_change — whenever the assignee or due date changes,
-- clear every reminder-dedup column so the scheduler recomputes cleanly for
-- the new assignee/deadline (spec §15: reassigned -> old assignee stops
-- receiving anything further since every reminder query reads the *current*
-- assignee_id; due date changed -> recalculate reminders).
-- ----------------------------------------------------------------------------
create or replace function public.reset_task_reminders_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is distinct from old.assignee_id or new.due_date is distinct from old.due_date then
    new.reminder_24h_sent_at := null;
    new.reminder_1h_sent_at := null;
    new.overdue_last_notified_at := null;
    new.is_overdue := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_task_reminders_on_change on public.tasks;
create trigger trg_reset_task_reminders_on_change
  before update on public.tasks
  for each row execute function public.reset_task_reminders_on_change();

-- ----------------------------------------------------------------------------
-- set_task_completion_fields — records who completed a task and when,
-- server-side (not trusted from the client), and clears both if a task is
-- reopened from 'done'.
-- ----------------------------------------------------------------------------
create or replace function public.set_task_completion_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_task_completion_fields on public.tasks;
create trigger trg_set_task_completion_fields
  before update on public.tasks
  for each row execute function public.set_task_completion_fields();

-- ----------------------------------------------------------------------------
-- notify_task_assigned (0044) extended — distinguishes a first assignment
-- from a genuine reassignment (old assignee not null, new one different),
-- and now routes through notify_task_event so the assignment also lands in
-- notification_log, and carries the task's own priority through to the
-- notification's priority (Urgent/High tasks stand out in the bell too).
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  reassigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
    reassigned := false;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
    reassigned := assigned and old.assignee_id is not null;
  end if;

  if assigned and (auth.uid() is null or new.assignee_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_task_event(
      new.organization_id, new.id, new.matter_id, new.assignee_id, auth.uid(),
      case when reassigned then 'task_reassigned' else 'task_assigned' end,
      coalesce(actor_name, 'Someone') ||
        (case when reassigned then ' reassigned you a task: ' else ' assigned you a task: ' end) || new.title,
      public.task_notification_priority(new.priority)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ----------------------------------------------------------------------------
-- track_task_assigned (0044) extended — same first-assignment vs
-- reassignment distinction, now logged as separate matter_events kinds.
-- ----------------------------------------------------------------------------
create or replace function public.track_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assignee_name text;
  assigned boolean;
  reassigned boolean;
begin
  if new.matter_id is null then return new; end if;
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
    reassigned := false;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
    reassigned := assigned and old.assignee_id is not null;
  end if;
  if not assigned then return new; end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into assignee_name from public.profiles where id = new.assignee_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(),
    case when reassigned then 'task_reassigned' else 'task_assigned' end,
    coalesce(actor_name, 'Someone') || (case when reassigned then ' reassigned task "' else ' assigned task "' end)
      || new.title || '" to ' || coalesce(assignee_name, 'someone'));
  return new;
end $$;

drop trigger if exists trg_track_task_assigned on public.tasks;
create trigger trg_track_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.track_task_assigned();

-- ----------------------------------------------------------------------------
-- notify_task_completed — tells the task's creator when someone else
-- completes it (spec §5). Cancels-future-reminders is already implicit: the
-- Part D scheduler only ever looks at tasks with status not in ('done',
-- 'cancelled').
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and new.created_by is not null and (auth.uid() is null or new.created_by <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_task_event(
      new.organization_id, new.id, new.matter_id, new.created_by, auth.uid(),
      'task_completed', coalesce(actor_name, 'Someone') || ' completed: ' || new.title, 'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_completed on public.tasks;
create trigger trg_notify_task_completed
  after update on public.tasks
  for each row execute function public.notify_task_completed();

-- ----------------------------------------------------------------------------
-- track_task_deleted — cascade-guarded exactly like track_hearing_deleted/
-- track_document_removed: skip when the parent matter/org is what's actually
-- being torn down, only log when the task itself is deliberately removed.
-- ----------------------------------------------------------------------------
create or replace function public.track_task_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.matters where id = old.matter_id)
     or not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (old.organization_id, old.matter_id, auth.uid(), 'task_deleted',
    coalesce(actor_name, 'Someone') || ' deleted task "' || old.title || '"');
  return old;
end $$;

drop trigger if exists trg_track_task_deleted on public.tasks;
create trigger trg_track_task_deleted
  after delete on public.tasks
  for each row execute function public.track_task_deleted();

-- ----------------------------------------------------------------------------
-- track_task_priority_changed / track_task_due_date_changed — targeted,
-- only fire on an actual change to that one field (spec §14).
-- ----------------------------------------------------------------------------
create or replace function public.track_task_priority_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null or new.priority = old.priority then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_priority_changed',
    coalesce(actor_name, 'Someone') || ' changed priority of "' || new.title || '" to ' || new.priority);
  return new;
end $$;

drop trigger if exists trg_track_task_priority_changed on public.tasks;
create trigger trg_track_task_priority_changed
  after update of priority on public.tasks
  for each row execute function public.track_task_priority_changed();

create or replace function public.track_task_due_date_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null or new.due_date is not distinct from old.due_date then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_due_date_changed',
    coalesce(actor_name, 'Someone') || ' changed the due date of "' || new.title || '" to ' ||
    coalesce(to_char(new.due_date, 'FMMon DD, YYYY'), 'none'));
  return new;
end $$;

drop trigger if exists trg_track_task_due_date_changed on public.tasks;
create trigger trg_track_task_due_date_changed
  after update of due_date on public.tasks
  for each row execute function public.track_task_due_date_changed();
