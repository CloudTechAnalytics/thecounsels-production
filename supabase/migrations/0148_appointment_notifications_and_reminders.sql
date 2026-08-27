-- ============================================================================
-- Migration 0148 — Appointments: real email/WhatsApp on assignment, and the
-- scheduled reminder engine 0110 explicitly deferred ("a natural later
-- addition, not built here"). Confirmed with the user: make sure
-- appointments send both.
--
-- Two real gaps closed:
--
-- 1. notify_appointment_assigned() (0110) only ever called notify_user()
--    (in-app) — appointments.assigned_to never got an actual email/WhatsApp
--    for their own assignment, unlike tasks (dispatch_task_notification)
--    and hearings (dispatch_hearing_notification). Fixed by giving
--    appointments the same dispatch_*_notification shape: check
--    notification_preferences, queue EMAIL/WHATSAPP via notification_log,
--    hand off to send-task-notification (now taught to render appointment
--    emails too — see that function's own changes alongside this
--    migration).
--
-- 2. No reminder before the appointment itself — mirrors the hearing
--    reminder engine exactly, including its known race fix (0143): claim
--    each reminder flag atomically (UPDATE ... WHERE ... IS NULL, only
--    send if that UPDATE actually changed a row) rather than check-then-
--    act, so a manual trigger and the cron tick landing in the same
--    instant can never double-send. Recipient is the single assignee
--    (appointments don't have a "team" the way matters/hearings do — see
--    0110's own note on that), skipped entirely if unassigned.
-- ============================================================================

alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz;

-- Two new channel-pref keys, distinct from tasks' 'assigned'/'reassigned'
-- (a user may want task-assignment email but not appointment-assignment
-- email, or vice versa) and from hearings' 'hearing_reminder'.
create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (user_id, in_app_enabled, browser_enabled, email_enabled, sms_enabled, whatsapp_enabled, task_channel_prefs)
  values (
    new.id, true, false, true, false, false,
    '{
      "assigned":   {"email": true, "whatsapp": true},
      "due_soon":   {"email": true, "whatsapp": true},
      "overdue":    {"email": true, "whatsapp": true},
      "completed":  {"email": true, "whatsapp": true},
      "reassigned": {"email": true, "whatsapp": true},
      "hearing_reminder": {"email": true, "whatsapp": true},
      "appointment_assigned": {"email": true, "whatsapp": true},
      "appointment_reminder": {"email": true, "whatsapp": true}
    }'::jsonb
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- dispatch_appointment_notification — mirrors dispatch_hearing_notification
-- (0099) exactly: in-app always, EMAIL/WHATSAPP queued through
-- notification_log + pg_net -> send-task-notification when the recipient's
-- prefs allow it.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_appointment_notification(
  p_appointment_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_actor uuid default null,
  p_channel_key text default 'appointment_assigned',
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  prefs record;
  base_url text;
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
begin
  select id, organization_id into a from public.appointments where id = p_appointment_id;
  if a.id is null or p_user_id is null then
    return;
  end if;

  perform public.notify_user(a.organization_id, p_user_id, p_actor, 'appointments', p_type, 'appointment', p_appointment_id, p_title, p_priority);

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true)
    and public.org_has_feature(a.organization_id, 'whatsapp_reminders');

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, appointment_id, notification_type, channel, status)
    values (a.organization_id, p_user_id, p_actor, a.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null or base_url is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key/project_url not set in Vault).'
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
    insert into public.notification_log (organization_id, user_id, actor_id, appointment_id, notification_type, channel, status)
    values (a.organization_id, p_user_id, p_actor, a.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if svc_key is null or base_url is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key/project_url not set in Vault).'
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

-- Same trigger, now dispatching for real instead of just notify_appointment_event.
create or replace function public.notify_appointment_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  assigned boolean;
  reassigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.assigned_to_id is not null;
    reassigned := false;
  else
    assigned := new.assigned_to_id is not null and new.assigned_to_id is distinct from old.assigned_to_id;
    reassigned := assigned and old.assigned_to_id is not null;
  end if;

  if assigned and (auth.uid() is null or new.assigned_to_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.dispatch_appointment_notification(
      new.id, new.assigned_to_id,
      case when reassigned then 'appointment_reassigned' else 'appointment_assigned' end,
      coalesce(actor_name, 'Someone') ||
        (case when reassigned then ' reassigned you an appointment: ' else ' assigned you an appointment: ' end) || new.title,
      auth.uid(),
      'appointment_assigned'
    );
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Reminder engine — mirrors dispatch_hearing_reminders_if_due (0141/0143,
-- including its race fix) exactly, one recipient (the assignee) instead of
-- a fan-out.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_appointment_reminders_if_due(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_title text;
  v_claimed int;
begin
  select id, assigned_to_id, title, appointment_at, location, status,
         reminder_24h_sent_at, reminder_1h_sent_at
    into a from public.appointments where id = p_appointment_id;
  if a.id is null or a.status <> 'scheduled' or a.appointment_at <= now() or a.assigned_to_id is null then
    return;
  end if;

  if a.reminder_24h_sent_at is null and now() >= a.appointment_at - interval '24 hours' then
    update public.appointments set reminder_24h_sent_at = now()
      where id = p_appointment_id and reminder_24h_sent_at is null;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      v_title := 'Appointment tomorrow: "' || a.title || '" at ' || to_char(a.appointment_at, 'FMMon DD, HH24:MI')
        || coalesce(', ' || a.location, '');
      perform public.dispatch_appointment_notification(a.id, a.assigned_to_id, 'appointment_reminder_24h', v_title, null, 'appointment_reminder', 'reminder');
    end if;
  end if;

  if a.reminder_1h_sent_at is null and now() >= a.appointment_at - interval '1 hour' then
    update public.appointments set reminder_1h_sent_at = now()
      where id = p_appointment_id and reminder_1h_sent_at is null;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      v_title := 'Appointment in 1 hour: "' || a.title || '" at ' || to_char(a.appointment_at, 'FMMon DD, HH24:MI')
        || coalesce(', ' || a.location, '');
      perform public.dispatch_appointment_notification(a.id, a.assigned_to_id, 'appointment_reminder_1h', v_title, null, 'appointment_reminder', 'reminder');
    end if;
  end if;
end;
$$;

create or replace function public.run_appointment_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  for a in
    select id from public.appointments
    where status = 'scheduled' and appointment_at > now()
  loop
    perform public.dispatch_appointment_reminders_if_due(a.id);
  end loop;
end;
$$;

select cron.schedule('appointment-reminders', '*/10 * * * *', $$select public.run_appointment_reminders();$$);
