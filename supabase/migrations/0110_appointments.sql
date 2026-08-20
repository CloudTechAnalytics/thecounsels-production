-- ============================================================================
-- Migration 0110 — Appointments (Business plan and above).
--
-- Staff (secretary/receptionist, typically) schedule an appointment on
-- behalf of a client — clients are records in this app, not users; there
-- is no client portal and none is being built here — and assign it to a
-- staff member, who gets notified. Mirrors Hearings closely: same table
-- shape, same RLS shape, same "notify the assignee" pattern (which is
-- notify_task_assigned()'s shape, not the matter-team fan-out hearings use
-- for their own notifications — an appointment has one assignee, not a
-- whole matter team).
--
-- matter_id is optional, same as hearings' — an appointment is often a
-- consultation before any matter exists yet. When it IS linked to a
-- matter, insert respects the same "no new activity on a closed matter"
-- convention as everything else (documents, tasks, hearings, notes).
--
-- No scheduled "X hours before" reminder in v1 — the actual ask was the
-- immediate assignment notification. The hearing reminder engine's
-- scheduled-reminder machinery is a natural later addition, not built
-- here.
-- ============================================================================

create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');

create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete set null,
  matter_id        uuid references public.matters(id) on delete set null,
  title            text not null,
  appointment_at   timestamptz not null,
  duration_minutes int,
  location         text,
  assigned_to_id   uuid references public.profiles(id) on delete set null,
  status           public.appointment_status not null default 'scheduled',
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_appointments_org on public.appointments (organization_id);
create index idx_appointments_org_at on public.appointments (organization_id, appointment_at);
create index idx_appointments_matter on public.appointments (matter_id) where matter_id is not null;
create index idx_appointments_assigned_to on public.appointments (assigned_to_id) where assigned_to_id is not null;

create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy "appointments_select" on public.appointments
  for select using (public.has_permission(organization_id, 'appointments.view'));

create policy "appointments_insert" on public.appointments
  for insert with check (
    public.has_permission(organization_id, 'appointments.create')
    and public.org_has_feature(organization_id, 'appointments')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

create policy "appointments_update" on public.appointments
  for update
  using (public.has_permission(organization_id, 'appointments.update'))
  with check (
    public.has_permission(organization_id, 'appointments.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

create policy "appointments_delete" on public.appointments
  for delete using (public.has_permission(organization_id, 'appointments.delete'));

-- ----------------------------------------------------------------------------
-- Notifications — mirrors notification_log's existing hearing_id column
-- (0099) and notify_task_event()'s exact shape (0058): one in-app
-- notify_user() call plus a matching notification_log IN_APP/SENT row so
-- appointment assignment shows in the delivery audit trail too.
-- ----------------------------------------------------------------------------
alter type public.notification_category add value if not exists 'appointments';

alter table public.notification_log
  add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;
create index if not exists idx_notification_log_appointment on public.notification_log (appointment_id);

create or replace function public.notify_appointment_event(
  p_org uuid,
  p_appointment_id uuid,
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  perform public.notify_user(p_org, p_user, p_actor, 'appointments'::public.notification_category, p_type, 'appointment', p_appointment_id, p_title, p_priority);
  insert into public.notification_log (organization_id, user_id, actor_id, appointment_id, notification_type, channel, status, sent_at)
  values (p_org, p_user, p_actor, p_appointment_id, p_type, 'IN_APP', 'SENT', now());
end;
$$;

-- Mirrors notify_task_assigned()'s exact logic (0058): notify only when an
-- assignee is set and it changed, skip self-notify, distinguish
-- assigned vs. reassigned by whether an assignee already existed.
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
    perform public.notify_appointment_event(
      new.organization_id, new.id, new.assigned_to_id, auth.uid(),
      case when reassigned then 'appointment_reassigned' else 'appointment_assigned' end,
      coalesce(actor_name, 'Someone') ||
        (case when reassigned then ' reassigned you an appointment: ' else ' assigned you an appointment: ' end) || new.title
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_appointment_assigned on public.appointments;
create trigger trg_notify_appointment_assigned
  after insert or update of assigned_to_id on public.appointments
  for each row execute function public.notify_appointment_assigned();

-- ----------------------------------------------------------------------------
-- Permissions — copied directly from Hearings' current grant set, not
-- hand-designed. Same roles doing an analogous thing (secretary/
-- receptionist create+update, most fee-earner roles view, leadership
-- deletes) already proven correct for hearings.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action) values
  ('appointments.view', 'appointments', 'view'),
  ('appointments.create', 'appointments', 'create'),
  ('appointments.update', 'appointments', 'update'),
  ('appointments.delete', 'appointments', 'delete')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select rp.role_id, p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id = rp.permission_id and p1.key like 'hearings.%'
join public.permissions p2 on p2.key = replace(p1.key, 'hearings.', 'appointments.')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Plan feature — Business and above only. Merge, not full-replace, so the
-- other existing keys (messaging/whatsapp_reminders/hr_module/
-- ai_summarization) aren't restated.
-- ----------------------------------------------------------------------------
update public.plans set features = features || '{"appointments": false}'::jsonb where key in ('starter', 'professional');
update public.plans set features = features || '{"appointments": true}'::jsonb where key in ('business', 'enterprise');
