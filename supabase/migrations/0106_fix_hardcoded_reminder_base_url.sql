-- ============================================================================
-- Migration 0106 — Fix hardcoded reminder-dispatch base_url.
--
-- dispatch_task_notification() and dispatch_hearing_notification() both
-- hardcoded base_url to the ORIGINAL dev/test project's URL
-- (hkqmhcpnmlydkhzrgojd) — written back when that was the only Supabase
-- project that existed. This migration has since been replayed onto the
-- new, separate Testing and Production projects unchanged, so on both of
-- them every task/hearing reminder email is silently posted to the WRONG
-- project's send-task-notification function (authenticated with THIS
-- project's own service_role_key, which that other project doesn't
-- recognize) — not a hard SQL error (net.http_post is async, so the
-- calling function still returns normally), just a silent misroute. This
-- is a plausible reason reminder emails were never actually observed
-- landing anywhere, independent of whatever caused today's hearing-
-- reminders cron run to report Failed.
--
-- Fix: base_url is not secret (already public in frontend config, same
-- reasoning applied when service_role_key first went into Vault) — but
-- since it's project-specific and this migration file is shared across
-- environments, it can't be hardcoded correctly for both here. Read it
-- from Vault instead, same mechanism already proven for service_role_key.
-- Falls back to NULL (not the old wrong URL) when unset, so an
-- unconfigured project fails loudly into notification_log rather than
-- silently misrouting — same honest-FAILED posture used everywhere else
-- in this pipeline.
--
-- Requires one new Vault secret per project (run once, in each project's
-- own SQL editor):
--   select vault.create_secret('https://<that-project-ref>.supabase.co', 'project_url');
-- ============================================================================
create or replace function public.dispatch_task_notification(
  p_task_id uuid,
  p_user_id uuid,
  p_type text,
  p_priority public.notification_priority,
  p_channel_key text,
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

  perform public.notify_task_event(t.organization_id, t.id, t.matter_id, p_user_id, p_actor, p_type, fn_title, p_priority);

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
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true)
    and public.org_has_feature(t.organization_id, 'whatsapp_reminders');

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
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
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'WHATSAPP', 'PENDING')
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

create or replace function public.dispatch_hearing_notification(
  p_hearing_id uuid,
  p_user_id uuid,
  p_type text,
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

  perform public.notify_user(h.organization_id, p_user_id, p_actor, 'hearings', p_type, 'hearing', p_hearing_id, p_title, 'reminder');

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'whatsapp')::boolean, true)
    and public.org_has_feature(h.organization_id, 'whatsapp_reminders');

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
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
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'WHATSAPP', 'PENDING')
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
