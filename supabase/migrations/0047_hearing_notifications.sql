-- ============================================================================
-- Migration 0047 — Hearing notification workflow.
--
-- Every existing notify_* trigger (0025/0030/0035/0036/0044) resolves and
-- notifies exactly one recipient (usually lead_lawyer_id). Hearings need the
-- whole Matter Team — lead_lawyer_id UNION matter_assignments, the same set
-- has_matter_access() checks — so this adds the fan-out helper no existing
-- trigger needed, then wires create/modify/reschedule/cancel/delete on
-- hearings to both notify_user (in-app, via the helper) and matter_events
-- (Activity Timeline). Today hearings only get an AFTER INSERT trigger
-- (track_hearing_scheduled, 0022) — update/delete produce nothing at all.
--
-- Email is explicitly out of scope for this migration (no email-sending
-- infrastructure exists anywhere in this project yet — see
-- notification_preferences.email_enabled, a UI-only stub).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. notify_matter_team — fan out a notification to everyone with access to
--    a matter (lead lawyer + matter_assignments), skipping the actor.
--    Recipients are always a subset of has_matter_access(), so this can
--    never reach someone unrelated to the matter.
-- ----------------------------------------------------------------------------
create or replace function public.notify_matter_team(
  p_org uuid,
  p_matter uuid,
  p_actor uuid,
  p_category public.notification_category,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select m.lead_lawyer_id as user_id from public.matters m where m.id = p_matter and m.lead_lawyer_id is not null
    union
    select ma.user_id from public.matter_assignments ma where ma.matter_id = p_matter
  loop
    if p_actor is null or recipient <> p_actor then
      perform public.notify_user(p_org, recipient, p_actor, p_category, p_action, p_entity_type, p_entity_id, p_title, p_priority);
    end if;
  end loop;
end;
$$;

grant execute on function public.notify_matter_team(
  uuid, uuid, uuid, public.notification_category, text, text, uuid, text, public.notification_priority
) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. hearing_notification_title — one shared formatter so every hearing
--    notification carries the same required fields (matter, hearing title,
--    date, time, court, actor) in the same shape.
-- ----------------------------------------------------------------------------
create or replace function public.hearing_notification_title(
  p_verb text,
  p_actor_name text,
  p_matter_number text,
  p_matter_title text,
  p_hearing_title text,
  p_hearing_at timestamptz,
  p_court text
)
returns text
language sql
immutable
as $$
  select coalesce(p_actor_name, 'Someone') || ' ' || p_verb || ' a hearing on '
    || coalesce(p_matter_number, p_matter_title, 'a matter') || ': "' || p_hearing_title || '" — '
    || to_char(p_hearing_at, 'FMMon DD, YYYY HH24:MI')
    || case when p_court is not null and p_court <> '' then ', ' || p_court else '' end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Created — extend the existing AFTER INSERT trigger with the fan-out.
--    The matter_events insert is unchanged from 0022.
-- ----------------------------------------------------------------------------
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

    perform public.notify_matter_team(new.organization_id, new.matter_id, actor,
      'hearings', 'hearing.scheduled', 'matter', new.matter_id, title, 'info');
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Modified / rescheduled / cancelled — entirely new. Classifies the
--    update so the wording and priority match what actually happened.
-- ----------------------------------------------------------------------------
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
begin
  if new.matter_id is null then return new; end if;

  if new.hearing_at is distinct from old.hearing_at then
    kind := 'hearing_rescheduled'; verb := 'rescheduled';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    kind := 'hearing_cancelled'; verb := 'cancelled';
  elsif new.title is distinct from old.title
     or new.court is distinct from old.court
     or new.judge is distinct from old.judge
     or new.location is distinct from old.location
     or new.type is distinct from old.type
     or new.status is distinct from old.status
     or new.outcome is distinct from old.outcome
     or new.notes is distinct from old.notes
     or new.duration_minutes is distinct from old.duration_minutes then
    kind := 'hearing_updated'; verb := 'updated';
  else
    return new; -- nothing meaningful changed (e.g. only updated_at)
  end if;

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

  perform public.notify_matter_team(new.organization_id, new.matter_id, auth.uid(),
    'hearings', 'hearing.' || replace(kind, 'hearing_', ''), 'matter', new.matter_id, title,
    case when kind = 'hearing_cancelled' then 'warning' else 'info' end);

  return new;
end $$;

drop trigger if exists trg_track_hearing_modified on public.hearings;
create trigger trg_track_hearing_modified
  after update on public.hearings
  for each row execute function public.track_hearing_modified();

-- ----------------------------------------------------------------------------
-- 5. Deleted — entirely new. Guarded against cascading matter/org deletion
--    the same way 0028's track_document_removed / 0033's
--    track_matter_assignment_removed were fixed: only log when the
--    organization and matter this event references are still actually
--    there (they won't be if this hearing is being deleted as a side
--    effect of deleting its whole matter, in the same breath).
-- ----------------------------------------------------------------------------
create or replace function public.track_hearing_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = old.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title('removed', actor_name, matter_number, matter_title, old.title, old.hearing_at, old.court);

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'hearing_deleted',
    'Removed hearing: ' || old.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')',
    jsonb_build_object('hearing_id', old.id));

  perform public.notify_matter_team(old.organization_id, old.matter_id, auth.uid(),
    'hearings', 'hearing.deleted', 'matter', old.matter_id, title, 'warning');

  return old;
end $$;

drop trigger if exists trg_track_hearing_deleted on public.hearings;
create trigger trg_track_hearing_deleted
  after delete on public.hearings
  for each row execute function public.track_hearing_deleted();
