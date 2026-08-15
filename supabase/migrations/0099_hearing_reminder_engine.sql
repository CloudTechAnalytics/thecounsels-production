-- ============================================================================
-- Migration 0098 — Hearing Reminder Engine.
--
-- Mirrors the task reminder engine (0057-0059) exactly, for hearings: a
-- pg_cron job runs hourly, finds every still-pending hearing (scheduled or
-- adjourned, not held/cancelled) approaching its time, and dispatches a
-- 24-hours-before and a 1-hour-before reminder to everyone on the matter's
-- team (lead lawyer + matter_assignments — the same recipient set
-- notify_matter_team, 0047, already uses for immediate hearing
-- notifications). Each reminder goes in-app (always) plus email/WhatsApp
-- per-recipient preference, through the same notification_log +
-- send-task-notification Edge Function pipeline tasks already use.
--
-- Unlike tasks (date-only due_date, so 0059 has to assume a fixed 17:00 UTC
-- deadline), hearings already have a real hearing_at timestamptz — no
-- assumption needed, the reminder math is exact.
-- ============================================================================

alter table public.hearings
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz;

alter table public.notification_log
  add column if not exists hearing_id uuid references public.hearings(id) on delete cascade;
create index if not exists idx_notification_log_hearing on public.notification_log (hearing_id);

-- notification_type check was implicit (free text) for tasks; hearing types
-- reuse the same task_channel_prefs jsonb shape under a new key so no
-- backfill is needed — dispatch_hearing_notification's own coalesce below
-- already defaults to "on" when a user's prefs predate this key.
update public.notification_preferences
set task_channel_prefs = task_channel_prefs || '{"hearing_reminder": {"email": true, "whatsapp": true}}'::jsonb
where not (task_channel_prefs ? 'hearing_reminder');

alter table public.notification_preferences
  alter column task_channel_prefs set default '{
    "assigned":   {"email": true, "whatsapp": true},
    "due_soon":   {"email": true, "whatsapp": true},
    "overdue":    {"email": true, "whatsapp": true},
    "completed":  {"email": true, "whatsapp": true},
    "reassigned": {"email": true, "whatsapp": true},
    "hearing_reminder": {"email": true, "whatsapp": true}
  }'::jsonb;

-- ----------------------------------------------------------------------------
-- dispatch_hearing_notification — one recipient, one reminder. Mirrors
-- dispatch_task_notification's shape (0059) but targets a hearing; reuses
-- the exact same send-task-notification Edge Function (it now branches on
-- hearing_id vs task_id — see that function's own updated header comment).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_hearing_notification(
  p_hearing_id uuid,
  p_user_id uuid,
  p_type text,              -- 'hearing_reminder_24h' | 'hearing_reminder_1h'
  p_title text,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  prefs record;
  base_url text;
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
begin
  select id, organization_id into h from public.hearings where id = p_hearing_id;
  if h.id is null or p_user_id is null then
    return;
  end if;

  -- In-app: always fires, same "critical channel" posture as tasks.
  perform public.notify_user(h.organization_id, p_user_id, p_actor, 'hearings', p_type, 'hearing', p_hearing_id, p_title, 'reminder');

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  base_url := current_setting('app.settings.supabase_url', true);
  svc_key := current_setting('app.settings.service_role_key', true);

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
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
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'WHATSAPP', 'PENDING')
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
-- run_hearing_reminders — the hourly tick. hearing_at is a real timestamptz
-- (unlike tasks' date-only due_date), so the 24h/1h windows are exact, no
-- fixed-deadline assumption needed.
-- ----------------------------------------------------------------------------
create or replace function public.run_hearing_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  recipient record;
  title text;
  matter_number text;
begin
  for h in
    select id, matter_id, title, hearing_at, court, reminder_24h_sent_at, reminder_1h_sent_at
    from public.hearings
    where status in ('scheduled', 'adjourned')
      and hearing_at > now()
  loop
    matter_number := null;
    if h.matter_id is not null then
      select m.matter_number into matter_number from public.matters m where m.id = h.matter_id;
    end if;

    if h.reminder_24h_sent_at is null and now() >= h.hearing_at - interval '24 hours' then
      title := 'Hearing tomorrow: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_24h', title);
      end loop;
      update public.hearings set reminder_24h_sent_at = now() where id = h.id;
    end if;

    if h.reminder_1h_sent_at is null and now() >= h.hearing_at - interval '1 hour' then
      title := 'Hearing in 1 hour: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_1h', title);
      end loop;
      update public.hearings set reminder_1h_sent_at = now() where id = h.id;
    end if;
  end loop;
end;
$$;

select cron.schedule('hearing-reminders', '5 * * * *', $$select public.run_hearing_reminders();$$);
