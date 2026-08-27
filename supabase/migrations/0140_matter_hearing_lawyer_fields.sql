-- ============================================================================
-- Migration 0140 — Responsible Partner (matters), Assigned/Supporting
-- Lawyer (hearings), and a real hearing-notification recipient list.
--
-- Requested together because they're connected: the reporting problem was
-- "who actually gets a hearing reminder email" — the answer needed a place
-- to name a branch's accountable partner (Responsible Partner) and a
-- hearing's own attendees (Assigned/Supporting Lawyer), not just whoever
-- happens to be the matter's lead lawyer or on matter_assignments.
-- ============================================================================

alter table public.matters
  add column responsible_partner_id uuid references public.profiles(id) on delete set null;

alter table public.hearings
  add column assigned_lawyer_id uuid references public.profiles(id) on delete set null;

-- Supporting lawyers — plural, many-to-many, mirrors matter_assignments'
-- own shape exactly (same columns, same cascade behavior).
create table public.hearing_supporting_lawyers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hearing_id      uuid not null references public.hearings(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (hearing_id, user_id)
);
create index idx_hearing_supporting_lawyers_hearing on public.hearing_supporting_lawyers (hearing_id);

alter table public.hearing_supporting_lawyers enable row level security;

-- Same access shape as hearings itself (0126's fixed hearings_select) —
-- visible to anyone who can see the hearing; managed by anyone who could
-- edit it (hearings.update, gated the same way hearings_update already is).
create policy "hearing_supporting_lawyers_select" on public.hearing_supporting_lawyers
  for select using (
    exists (
      select 1 from public.hearings h
      where h.id = hearing_id
        and has_permission(h.organization_id, 'hearings.view'::text)
        and (
          ((h.matter_id is not null) and has_matter_access(h.matter_id))
          or ((h.matter_id is null) and ((h.branch_id is null) or user_has_branch_access(h.organization_id, h.branch_id)))
        )
    )
  );

create policy "hearing_supporting_lawyers_write" on public.hearing_supporting_lawyers
  for all using (
    exists (
      select 1 from public.hearings h
      where h.id = hearing_id
        and has_permission(h.organization_id, 'hearings.update'::text)
        and (
          ((h.matter_id is not null) and has_matter_access(h.matter_id) and matter_is_open(h.matter_id))
          or ((h.matter_id is null) and ((h.branch_id is null) or user_has_branch_access(h.organization_id, h.branch_id)))
        )
    )
  )
  with check (
    exists (
      select 1 from public.hearings h
      where h.id = hearing_id
        and has_permission(h.organization_id, 'hearings.update'::text)
        and (
          ((h.matter_id is not null) and has_matter_access(h.matter_id) and matter_is_open(h.matter_id))
          or ((h.matter_id is null) and ((h.branch_id is null) or user_has_branch_access(h.organization_id, h.branch_id)))
        )
    )
  );

-- ----------------------------------------------------------------------------
-- hearing_recipients() — single source of truth for "who cares about this
-- hearing": the matter team (lead lawyer + matter_assignments, if it's on
-- a matter), this hearing's own assigned/supporting lawyers, the matter's
-- Responsible Partner, and every Managing Partner (firm-wide oversight,
-- same reasoning as their unconditional matters.view_all — see 0138).
-- Used by both the immediate "hearing scheduled/updated" notification and
-- the reminder engine, so the two can never drift apart on who's included.
-- ----------------------------------------------------------------------------
create or replace function public.hearing_recipients(p_hearing_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.lead_lawyer_id
    from public.hearings h join public.matters m on m.id = h.matter_id
    where h.id = p_hearing_id and m.lead_lawyer_id is not null
  union
  select ma.user_id
    from public.hearings h join public.matter_assignments ma on ma.matter_id = h.matter_id
    where h.id = p_hearing_id
  union
  select h.assigned_lawyer_id
    from public.hearings h
    where h.id = p_hearing_id and h.assigned_lawyer_id is not null
  union
  select hsl.user_id
    from public.hearing_supporting_lawyers hsl
    where hsl.hearing_id = p_hearing_id
  union
  select m.responsible_partner_id
    from public.hearings h join public.matters m on m.id = h.matter_id
    where h.id = p_hearing_id and m.responsible_partner_id is not null
  union
  select mem.user_id
    from public.hearings h
    join public.memberships mem on mem.organization_id = h.organization_id
    join public.roles r on r.id = mem.role_id
    where h.id = p_hearing_id and mem.status = 'active' and r.key = 'managing_partner';
$$;

-- ----------------------------------------------------------------------------
-- notify_hearing_team() — same fan-out shape as notify_matter_team (0047),
-- but sourced from hearing_recipients() instead of just the matter team.
-- Deliberately a NEW function rather than widening notify_matter_team
-- itself — that one's reused for tasks/documents/other matter events,
-- which should NOT suddenly start reaching the Responsible Partner and
-- every Managing Partner just because a task changed.
-- ----------------------------------------------------------------------------
create or replace function public.notify_hearing_team(
  p_org uuid,
  p_hearing_id uuid,
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
  for recipient in select * from public.hearing_recipients(p_hearing_id) loop
    if p_actor is null or recipient <> p_actor then
      perform public.notify_user(p_org, recipient, p_actor, p_category, p_action, p_entity_type, p_entity_id, p_title, p_priority);
    end if;
  end loop;
end;
$$;

grant execute on function public.notify_hearing_team(
  uuid, uuid, uuid, public.notification_category, text, text, uuid, text, public.notification_priority
) to authenticated;

-- ----------------------------------------------------------------------------
-- Wire the three existing hearing triggers (0047) to the new recipient
-- set instead of notify_matter_team. Logic otherwise identical — only the
-- notify_* call changes.
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

    perform public.notify_hearing_team(new.organization_id, new.id, actor,
      'hearings', 'hearing.scheduled', 'matter', new.matter_id, title, 'info');
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
     or new.duration_minutes is distinct from old.duration_minutes
     or new.assigned_lawyer_id is distinct from old.assigned_lawyer_id then
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

  perform public.notify_hearing_team(new.organization_id, new.id, auth.uid(),
    'hearings', 'hearing.' || replace(kind, 'hearing_', ''), 'matter', new.matter_id, title,
    case when kind = 'hearing_cancelled' then 'warning' else 'info' end);

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

  -- old.id still resolves through hearing_recipients() here — the row
  -- itself (and its supporting-lawyer rows, cascade-deleted alongside it)
  -- hasn't actually been removed from the table yet inside an AFTER DELETE
  -- trigger's own transaction.
  perform public.notify_hearing_team(old.organization_id, old.id, auth.uid(),
    'hearings', 'hearing.deleted', 'matter', old.matter_id, title, 'warning');

  return old;
end $$;

-- ----------------------------------------------------------------------------
-- run_hearing_reminders() — same hourly job (0098/0107), now looping over
-- hearing_recipients() instead of its own separate inline lead_lawyer +
-- matter_assignments query. This is the actual fix for "who gets the
-- reminder email" — the loop body (dispatch_hearing_notification call)
-- and the 24h/1h timing logic are unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.run_hearing_reminders()
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
  end loop;
end;
$$;
