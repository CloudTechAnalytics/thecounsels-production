-- ============================================================================
-- Migration 0095 — fix "function notify_matter_team(...) does not exist"
-- when editing a hearing.
--
-- Root cause: track_hearing_modified() builds the priority argument with
-- `case when kind = 'hearing_cancelled' then 'warning' else 'info' end`.
-- Postgres resolves a CASE expression's type from its branches BEFORE it
-- knows what the surrounding function call expects — with two plain string
-- literal branches, that resolves to `text`, not the "unknown" type a bare
-- literal would have. `text` cannot implicitly cast to a custom enum
-- (notification_priority) during function-argument matching, so Postgres
-- can't find any matching overload of notify_matter_team and reports it as
-- not existing at all — even though the correct one is right there.
--
-- track_hearing_scheduled() and track_hearing_deleted() pass a bare
-- literal ('info' / 'warning') with no CASE, so they never hit this — this
-- is exactly why *creating* a hearing worked but *editing* one didn't.
--
-- Fixed by explicitly casting every notify_matter_team argument in all
-- three functions, closing off this whole class of "which literal is
-- 'unknown' vs already-typed" ambiguity for good, not just this one spot.
-- ============================================================================

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
      'hearings'::public.notification_category, 'hearing.scheduled'::text, 'matter'::text, new.matter_id, title,
      'info'::public.notification_priority);
  end if;
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
    'hearings'::public.notification_category, ('hearing.' || replace(kind, 'hearing_', ''))::text, 'matter'::text, new.matter_id, title,
    (case when kind = 'hearing_cancelled' then 'warning' else 'info' end)::public.notification_priority);

  return new;
end $$;

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
    'hearings'::public.notification_category, 'hearing.deleted'::text, 'matter'::text, old.matter_id, title,
    'warning'::public.notification_priority);

  return old;
end $$;
