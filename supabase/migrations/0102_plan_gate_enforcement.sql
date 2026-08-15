-- ============================================================================
-- Migration 0101 — Plan-Based Feature Gating, Part B: enforcement.
--
-- Enforcement boundary: gate the ability to CREATE new activity in a
-- gated module, not historical read access — matches the app's existing
-- convention (a closed matter stays fully readable, just not writable).
-- If a firm downgrades, old messages/HR records aren't yanked away, they
-- just can't make new ones.
--
-- For HR specifically this means: gate the "create new" entry points
-- (request_leave, hr_requests' own insert policy, assign_onboarding,
-- send_hr_announcement, and the departments/job_titles/leave_types config
-- writes) — but deliberately NOT review_leave_request() or
-- update_hr_request_status(), which resolve an EXISTING pending item.
-- Gating those would strand a request submitted while the org still had
-- HR access, permanently unresolvable after a downgrade — the opposite of
-- the "don't punish historical data" principle this whole migration is
-- built around.
--
-- The frontend route guard (App-side, not this migration) is the primary
-- UX gate for HR — these DB-level checks are defense-in-depth against a
-- direct API call, not the main experience.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Messaging — gate the three "create new" policies + the DM-creation RPC.
--    Existing conversations/messages stay fully readable either way (their
--    _select policies are untouched).
-- ----------------------------------------------------------------------------
drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert with check (
    public.has_permission(organization_id, 'messaging.create_channels')
    and created_by = auth.uid()
    and public.org_has_feature(organization_id, 'messaging')
  );

drop policy if exists "channel_messages_insert" on public.channel_messages;
create policy "channel_messages_insert" on public.channel_messages
  for insert with check (
    public.has_permission(organization_id, 'messaging.send')
    and author_id = auth.uid()
    and exists (select 1 from public.channels c where c.id = channel_id and c.organization_id = organization_id and c.archived_at is null)
    and public.org_has_feature(organization_id, 'messaging')
  );

drop policy if exists "direct_messages_insert" on public.direct_messages;
create policy "direct_messages_insert" on public.direct_messages
  for insert with check (
    author_id = auth.uid()
    and public.has_permission(organization_id, 'messaging.send')
    and exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id and dc.organization_id = organization_id and auth.uid() in (dc.user_a, dc.user_b)
    )
    and public.org_has_feature(organization_id, 'messaging')
  );

create or replace function public.get_or_create_dm_conversation(p_org uuid, p_other uuid)
returns public.direct_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  rec public.direct_conversations;
begin
  if auth.uid() is null or p_other is null or p_other = auth.uid() then
    raise exception 'Invalid conversation participants';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'You are not a member of this organization';
  end if;
  if not public.org_has_feature(p_org, 'messaging') then
    raise exception 'Messaging is not included in your plan. Upgrade to Professional to use it.';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_other and m.organization_id = p_org and m.status = 'active'
  ) then
    raise exception 'That person is not a member of this organization';
  end if;

  a := least(auth.uid(), p_other);
  b := greatest(auth.uid(), p_other);

  select * into rec from public.direct_conversations where user_a = a and user_b = b;
  if rec.id is not null then
    return rec;
  end if;

  insert into public.direct_conversations (organization_id, user_a, user_b)
  values (p_org, a, b)
  returning * into rec;
  return rec;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. HR — config writes (departments/job titles/leave types) + the three
--    "create new" RPCs (request_leave, assign_onboarding,
--    send_hr_announcement) + hr_requests' own insert policy.
-- ----------------------------------------------------------------------------
drop policy if exists "departments_write" on public.departments;
create policy "departments_write" on public.departments
  for all
  using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "job_titles_write" on public.job_titles;
create policy "job_titles_write" on public.job_titles
  for all
  using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "leave_types_write" on public.leave_types;
create policy "leave_types_write" on public.leave_types
  for all
  using (public.has_permission(organization_id, 'leave.manage'))
  with check (public.has_permission(organization_id, 'leave.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "hr_requests_insert" on public.hr_requests;
create policy "hr_requests_insert" on public.hr_requests
  for insert with check (
    user_id = auth.uid() and status = 'submitted'
    and public.has_permission(organization_id, 'hr_requests.submit')
    and public.org_has_feature(organization_id, 'hr_module')
  );

create or replace function public.request_leave(
  p_org uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0)
    into v_limit, v_taken
    from public.leave_types t
    left join public.leave_balances b
      on b.organization_id = p_org and b.user_id = auth.uid() and b.leave_type_id = p_leave_type and b.year = v_year
    where t.id = p_leave_type;

  if v_days > (v_limit - v_taken) then
    raise exception '% requires % day(s), but only % day(s) remain of your % limit', v_type_name, v_days, (v_limit - v_taken), v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions perm on perm.id = rp.permission_id and perm.key = 'leave.manage'
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid();

  return rec;
end;
$$;

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
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
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
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
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

-- ----------------------------------------------------------------------------
-- 3. WhatsApp — gate the WHATSAPP branch specifically in both dispatch
--    functions (0098/0099). Email stays ungated — it's baseline on every
--    plan.
-- ----------------------------------------------------------------------------
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
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
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

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
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
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
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
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
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

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
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
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
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
