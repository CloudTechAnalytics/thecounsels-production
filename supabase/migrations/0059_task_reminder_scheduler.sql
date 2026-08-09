-- ============================================================================
-- Migration 0059 — Task & Meeting Notification/Reminder Engine, Part D:
-- the server-side scheduler. Does not depend on the app being open (spec
-- §10) — a pg_cron job runs run_task_reminders() hourly, independently of
-- the existing daily-subscription-checks job (0055); cron.schedule is keyed
-- by job name, so both coexist without interference.
--
-- dispatch_task_notification() is the one shared fan-out used both here
-- (for the three reminder/overdue event types) AND — via the two function
-- upgrades below — by task assignment/reassignment/completion, so every
-- task-related notification (not just reminders) gets real email/WhatsApp
-- delivery, gated by the recipient's notification_preferences.
--
-- REQUIRED ONE-TIME MANUAL STEP (cannot be embedded in a migration file —
-- these are per-project secrets, not schema): run_task_reminders() calls the
-- send-task-notification Edge Function via pg_net, which needs to know this
-- project's own URL and a service-role bearer token. From the Supabase SQL
-- editor, once, run:
--   alter database postgres set app.settings.supabase_url = 'https://<your-project-ref>.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service-role-key>';
-- Until both are set, dispatch_task_notification() honestly records EMAIL/
-- WHATSAPP attempts as FAILED ("Scheduler is not fully configured…") rather
-- than silently dropping them or faking success — in-app notifications are
-- unaffected either way, since those never leave the database.
-- ============================================================================

create or replace function public.dispatch_task_notification(
  p_task_id uuid,
  p_user_id uuid,
  p_type text,              -- 'task_assigned' | 'task_due_24h' | 'task_due_1h' | 'task_overdue' | 'task_completed' | 'task_reassigned'
  p_priority public.notification_priority,
  p_channel_key text,       -- key into notification_preferences.task_channel_prefs
  p_actor uuid default null,
  p_title text default null,
  p_log_timeline boolean default false,
  p_repeat_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  prefs record;
  base_url text;
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
  fn_title text;
begin
  select id, organization_id, matter_id, title into t from public.tasks where id = p_task_id;
  if t.id is null or p_user_id is null then
    return;
  end if;

  fn_title := coalesce(p_title, t.title);

  -- In-app: always fires, matching the pre-existing always-on behavior for
  -- task notifications (spec §7's "critical notifications" carve-out).
  perform public.notify_task_event(t.organization_id, t.id, t.matter_id, p_user_id, p_actor, p_type, fn_title, p_priority);

  -- Timeline: only for reminder/overdue events, and never on a repeat
  -- overdue notification (spec §14 — don't spam the timeline with every
  -- daily repeat). Lifecycle events (assigned/reassigned/completed) already
  -- get their own dedicated matter_events entry from the 0058 triggers, so
  -- this never double-logs those.
  if p_log_timeline and not p_repeat_only and t.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (t.organization_id, t.matter_id, p_actor,
      case when p_type = 'task_overdue' then 'task_overdue' else 'task_reminder_sent' end,
      fn_title);
  end if;

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  base_url := current_setting('app.settings.supabase_url', true);
  svc_key := current_setting('app.settings.service_role_key', true);

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Upgrade the 0058 lifecycle triggers to also dispatch email/WhatsApp (not
-- just in-app) — the acceptance scenario (spec §17) requires assignment to
-- deliver in-app *and* email *and* WhatsApp-if-configured immediately, not
-- only on the next reminder tick. p_log_timeline stays false: matter_events
-- for these events is already written by track_task_assigned/track_task_
-- completed (0058), so dispatch must not duplicate that entry.
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  reassigned boolean;
  event_title text;
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
    event_title := coalesce(actor_name, 'Someone') ||
      (case when reassigned then ' reassigned you a task: ' else ' assigned you a task: ' end) || new.title;
    perform public.dispatch_task_notification(
      p_task_id := new.id, p_user_id := new.assignee_id,
      p_type := case when reassigned then 'task_reassigned' else 'task_assigned' end,
      p_priority := public.task_notification_priority(new.priority),
      p_channel_key := case when reassigned then 'reassigned' else 'assigned' end,
      p_actor := auth.uid(), p_title := event_title
    );
  end if;
  return new;
end $$;

create or replace function public.notify_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and new.created_by is not null and (auth.uid() is null or new.created_by <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.dispatch_task_notification(
      p_task_id := new.id, p_user_id := new.created_by, p_type := 'task_completed',
      p_priority := 'info', p_channel_key := 'completed',
      p_actor := auth.uid(), p_title := coalesce(actor_name, 'Someone') || ' completed: ' || new.title
    );
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- run_task_reminders — the single place that finds incomplete, assigned,
-- due-dated tasks approaching (or past) their deadline, checks whether each
-- reminder type is already sent, sends it, records it, and never double-
-- sends (spec §10, verbatim). Deadline is a documented fixed constant
-- (17:00 UTC on the due date) since due_date has no time component — see
-- the plan's Context section for why.
-- ----------------------------------------------------------------------------
create or replace function public.run_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_deadline timestamptz;
begin
  for r in
    select id, assignee_id, reminder_24h_sent_at, reminder_1h_sent_at, is_overdue, overdue_last_notified_at, due_date
    from public.tasks
    where status not in ('done', 'cancelled')
      and assignee_id is not null
      and due_date is not null
  loop
    v_deadline := (r.due_date::timestamptz + time '17:00');

    if r.reminder_24h_sent_at is null and now() >= v_deadline - interval '24 hours' and now() < v_deadline then
      perform public.dispatch_task_notification(
        p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_due_24h',
        p_priority := 'reminder', p_channel_key := 'due_soon', p_log_timeline := true
      );
      update public.tasks set reminder_24h_sent_at = now() where id = r.id;
    end if;

    if r.reminder_1h_sent_at is null and now() >= v_deadline - interval '1 hour' and now() < v_deadline then
      perform public.dispatch_task_notification(
        p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_due_1h',
        p_priority := 'warning', p_channel_key := 'due_soon', p_log_timeline := true
      );
      update public.tasks set reminder_1h_sent_at = now() where id = r.id;
    end if;

    if now() >= v_deadline then
      if not r.is_overdue then
        update public.tasks set is_overdue = true where id = r.id;
        perform public.dispatch_task_notification(
          p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_overdue',
          p_priority := 'urgent', p_channel_key := 'overdue', p_log_timeline := true
        );
        update public.tasks set overdue_last_notified_at = now() where id = r.id;
      elsif r.overdue_last_notified_at is null or r.overdue_last_notified_at < now() - interval '20 hours' then
        -- Max one overdue reminder per day (spec §4); >20h tolerates the
        -- hourly tick's own jitter without drifting later each day.
        perform public.dispatch_task_notification(
          p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_overdue',
          p_priority := 'urgent', p_channel_key := 'overdue', p_log_timeline := true, p_repeat_only := true
        );
        update public.tasks set overdue_last_notified_at = now() where id = r.id;
      end if;
    end if;
  end loop;
end;
$$;

select cron.schedule('task-reminders', '0 * * * *', $$select public.run_task_reminders();$$);
