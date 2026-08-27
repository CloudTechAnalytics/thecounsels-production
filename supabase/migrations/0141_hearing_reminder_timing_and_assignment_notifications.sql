-- ============================================================================
-- Migration 0141 — Hearing reminders fire the moment they're due, not just
-- on the next hourly cron tick; being assigned to a hearing sends its own
-- specific notification instead of only the generic "hearing scheduled" one.
--
-- Reported: a hearing created at 10:30 for 11:00 got no reminder at all —
-- not even to the Managing Partner. Root cause: run_hearing_reminders()
-- only ever runs on the cron tick (hourly, at :05 past). A hearing created
-- less than an hour before it happens can have ZERO ticks between
-- creation and the hearing itself — this one's only possible check was
-- 11:05, five minutes after it had already happened.
--
-- Fix, two parts:
--   1. dispatch_hearing_reminders_if_due() — the actual 24h/1h check-and-
--      send logic, extracted from run_hearing_reminders() into its own
--      function so it can ALSO run immediately right when a hearing is
--      created or rescheduled into an already-due window, not just wait
--      for the next tick. Both places now share one implementation.
--   2. The cron tick itself also moves from hourly to every 10 minutes —
--      defense in depth for anything that reaches 'due' between triggers
--      (e.g. a hearing scheduled >1h out that simply ages into the 1h
--      window with no further edits happening to re-trigger it).
-- ============================================================================

create or replace function public.dispatch_hearing_reminders_if_due(p_hearing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  recipient uuid;
  v_title text;
  matter_number text;
begin
  select id, matter_id, title, hearing_at, court, status, reminder_24h_sent_at, reminder_1h_sent_at
    into h from public.hearings where id = p_hearing_id;
  if h.id is null or h.status not in ('scheduled', 'adjourned') or h.hearing_at <= now() then
    return;
  end if;

  matter_number := null;
  if h.matter_id is not null then
    select m.matter_number into matter_number from public.matters m where m.id = h.matter_id;
  end if;

  if h.reminder_24h_sent_at is null and now() >= h.hearing_at - interval '24 hours' then
    v_title := 'Hearing tomorrow: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
      || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');
    for recipient in select * from public.hearing_recipients(h.id) loop
      perform public.dispatch_hearing_notification(h.id, recipient, 'hearing_reminder_24h', v_title);
    end loop;
    update public.hearings set reminder_24h_sent_at = now() where id = h.id;
  end if;

  if h.reminder_1h_sent_at is null and now() >= h.hearing_at - interval '1 hour' then
    v_title := 'Hearing in 1 hour: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
      || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');
    for recipient in select * from public.hearing_recipients(h.id) loop
      perform public.dispatch_hearing_notification(h.id, recipient, 'hearing_reminder_1h', v_title);
    end loop;
    update public.hearings set reminder_1h_sent_at = now() where id = h.id;
  end if;
end;
$$;

create or replace function public.run_hearing_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
begin
  for h in
    select id from public.hearings
    where status in ('scheduled', 'adjourned') and hearing_at > now()
  loop
    perform public.dispatch_hearing_reminders_if_due(h.id);
  end loop;
end;
$$;

select cron.unschedule('hearing-reminders');
select cron.schedule('hearing-reminders', '*/10 * * * *', $$select public.run_hearing_reminders();$$);

-- ----------------------------------------------------------------------------
-- Assignment notifications — being made the Assigned Lawyer, or added as a
-- Supporting Lawyer, is its own event, not just folded into the generic
-- "hearing scheduled/updated" blast everyone on the team already gets.
-- Same reasoning notify_task_assigned already uses for tasks.
-- ----------------------------------------------------------------------------
create or replace function public.notify_hearing_supporting_lawyer_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  matter_title text;
  matter_number text;
  title text;
begin
  select id, organization_id, matter_id, title, hearing_at, court into h from public.hearings where id = new.hearing_id;
  if h.id is null then return new; end if;
  if h.matter_id is not null then
    select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = h.matter_id;
  end if;
  title := 'You were added as a supporting lawyer: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
    || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');
  perform public.notify_user(h.organization_id, new.user_id, new.assigned_by, 'hearings', 'hearing.supporting_lawyer_added',
    case when h.matter_id is not null then 'matter' else 'hearing' end, coalesce(h.matter_id, h.id), title, 'info');
  return new;
end;
$$;

drop trigger if exists trg_notify_hearing_supporting_lawyer_added on public.hearing_supporting_lawyers;
create trigger trg_notify_hearing_supporting_lawyer_added
  after insert on public.hearing_supporting_lawyers
  for each row execute function public.notify_hearing_supporting_lawyer_added();

-- track_hearing_scheduled/modified (0140) — extended to also send the new
-- Assigned Lawyer a direct, specific ping, and to run the immediate
-- reminder check (part 1 above) once the row is actually committed.
create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  actor uuid := coalesce(new.created_by, auth.uid());
  title text;
begin
  if new.matter_id is not null then
    select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
    select full_name into actor_name from public.profiles where id = actor;
    title := public.hearing_notification_title('scheduled', actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, actor, 'hearing_scheduled',
            'Scheduled hearing: ' || new.title || ' on ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI'),
            jsonb_build_object('hearing_id', new.id));

    perform public.notify_hearing_team(new.organization_id, new.id, actor,
      'hearings', 'hearing.scheduled', 'matter', new.matter_id, title, 'info');
  end if;

  if new.assigned_lawyer_id is not null and new.assigned_lawyer_id <> actor then
    perform public.notify_user(new.organization_id, new.assigned_lawyer_id, actor, 'hearings', 'hearing.lawyer_assigned',
      case when new.matter_id is not null then 'matter' else 'hearing' end, coalesce(new.matter_id, new.id),
      'You were assigned to a hearing: "' || new.title || '" at ' || to_char(new.hearing_at, 'FMMon DD, HH24:MI'), 'info');
  end if;

  perform public.dispatch_hearing_reminders_if_due(new.id);
  return new;
end $$;

create or replace function public.track_hearing_modified()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
  kind text;
  verb text;
  summary text;
  changed boolean := false;
begin
  if new.assigned_lawyer_id is distinct from old.assigned_lawyer_id and new.assigned_lawyer_id is not null
     and new.assigned_lawyer_id <> auth.uid() then
    perform public.notify_user(new.organization_id, new.assigned_lawyer_id, auth.uid(), 'hearings', 'hearing.lawyer_assigned',
      case when new.matter_id is not null then 'matter' else 'hearing' end, coalesce(new.matter_id, new.id),
      'You were assigned to a hearing: "' || new.title || '" at ' || to_char(new.hearing_at, 'FMMon DD, HH24:MI'), 'info');
  end if;

  perform public.dispatch_hearing_reminders_if_due(new.id);

  if new.matter_id is null then return new; end if;

  if new.hearing_at is distinct from old.hearing_at then
    kind := 'hearing_rescheduled'; verb := 'rescheduled'; changed := true;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    kind := 'hearing_cancelled'; verb := 'cancelled'; changed := true;
  elsif new.title is distinct from old.title
     or new.court is distinct from old.court
     or new.judge is distinct from old.judge
     or new.location is distinct from old.location
     or new.type is distinct from old.type
     or new.status is distinct from old.status
     or new.outcome is distinct from old.outcome
     or new.notes is distinct from old.notes
     or new.duration_minutes is distinct from old.duration_minutes
     or new.assigned_lawyer_id is distinct from old.assigned_lawyer_id then
    kind := 'hearing_updated'; verb := 'updated'; changed := true;
  end if;

  if not changed then return new; end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title(verb, actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

  summary := case kind
    when 'hearing_rescheduled' then 'Rescheduled hearing: ' || new.title || ' to ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI')
    when 'hearing_cancelled' then 'Cancelled hearing: ' || new.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')'
    else 'Updated hearing: ' || new.title
  end;

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, auth.uid(), kind, summary, jsonb_build_object('hearing_id', new.id));

  perform public.notify_hearing_team(new.organization_id, new.id, auth.uid(),
    'hearings', 'hearing.' || replace(kind, 'hearing_', ''), 'matter', new.matter_id, title,
    case when kind = 'hearing_cancelled' then 'warning' else 'info' end);

  return new;
end $$;
