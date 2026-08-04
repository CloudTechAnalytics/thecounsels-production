-- ============================================================================
-- Migration 0022 — Extend matter_events to cover hearings, tasks and invoices.
-- MatterTimeline already anticipates kind: 'hearing_scheduled' | 'task_added' |
-- 'task_completed' | 'invoice_created' (see EVENT_ICON in matter-timeline.tsx)
-- but nothing has written those kinds yet. Same trigger pattern as 0012, so the
-- timeline stays complete regardless of which client (RPC, direct write,
-- future import tooling) created the row.
-- ============================================================================

create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'hearing_scheduled',
            'Scheduled hearing: ' || new.title || ' on ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI'),
            jsonb_build_object('hearing_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_task_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'task_added',
            'Added task: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null and new.status = 'done' and old.status is distinct from 'done' then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'task_completed',
            'Completed task: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_invoice_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'invoice_created',
            'Invoice created for ' || to_char(new.total, 'FM999,999,990.00'),
            jsonb_build_object('invoice_id', new.id));
  end if;
  return new;
end $$;

create trigger trg_track_hearing_scheduled
  after insert on public.hearings for each row execute function public.track_hearing_scheduled();
create trigger trg_track_task_added
  after insert on public.tasks for each row execute function public.track_task_added();
create trigger trg_track_task_completed
  after update on public.tasks for each row execute function public.track_task_completed();
create trigger trg_track_invoice_created
  after insert on public.invoices for each row execute function public.track_invoice_created();

-- ----------------------------------------------------------------------------
-- Realtime: stream matter_events for the live Timeline tab. RLS still applies
-- (matter_events_select scopes by has_permission(org, 'matters.view')).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matter_events'
  ) then
    alter publication supabase_realtime add table public.matter_events;
  end if;
end $$;
