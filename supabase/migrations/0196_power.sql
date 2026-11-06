-- ============================================================================
-- Migration 0196 — Electricity & power management.
--
-- power_sources   each branch's grid meter(s), generators, solar and
--                 inverter systems. Generators carry a service interval in
--                 running hours and remember their last service.
-- power_logs      everything that happens to a source:
--                   token    prepaid meter units bought   (amount, kWh)
--                   bill     postpaid electricity bill    (amount, kWh)
--                   fuel     diesel / petrol bought       (amount, litres)
--                   runtime  generator hour-meter reading (hours run)
--                   service  maintenance done             (amount, hour meter)
--                   outage   grid off for N hours
--                   reading  a plain meter reading
--
-- Facility managers = 'power.manage' (Managing Partner, Finance, HR roles,
-- IT administrator), limited to their branches. A daily job tells them when
-- a generator is close to its service interval. Requests for money to buy
-- fuel / tokens go through the normal fund request flow ('utilities').
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('power.manage', 'power', 'manage', 'Record electricity, generator fuel, running hours and servicing')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'power.manage'
where r.key in ('managing_partner', 'finance', 'hr_manager', 'hr_administrator', 'hr', 'it_administrator')
on conflict do nothing;

create table if not exists public.power_sources (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  branch_id              uuid references public.branches(id) on delete set null,
  kind                   text not null check (kind in ('grid', 'generator', 'solar', 'inverter')),
  name                   text not null check (length(trim(name)) between 1 and 120),
  meter_no               text,
  capacity               text,
  fuel_type              text check (fuel_type in ('diesel', 'petrol', 'gas')),
  tank_litres            numeric(10,2) check (tank_litres is null or tank_litres > 0),
  service_interval_hours integer check (service_interval_hours is null or service_interval_hours > 0),
  hour_meter             numeric(12,1),
  last_service_on        date,
  last_service_hours     numeric(12,1),
  service_reminded_at    timestamptz,
  active                 boolean not null default true,
  notes                  text,
  created_by             uuid default auth.uid() references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_power_sources_org on public.power_sources (organization_id, branch_id);

create table if not exists public.power_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id       uuid not null references public.power_sources(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  kind            text not null check (kind in ('token', 'bill', 'fuel', 'runtime', 'service', 'outage', 'reading')),
  log_date        date not null default current_date,
  amount          numeric(14,2) check (amount is null or amount >= 0),
  quantity        numeric(12,2) check (quantity is null or quantity >= 0),
  meter_reading   numeric(12,1),
  vendor          text,
  reference       text,
  note            text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_power_logs_org_date on public.power_logs (organization_id, log_date desc);
create index if not exists idx_power_logs_source on public.power_logs (source_id, log_date desc);

-- Logs inherit the source's firm and branch; generator readings move the
-- hour meter; a service resets the service clock.
create or replace function public.power_log_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s public.power_sources;
begin
  select * into s from public.power_sources where id = new.source_id;
  if not found or s.organization_id <> new.organization_id then
    raise exception 'Power source not found';
  end if;
  new.branch_id := s.branch_id;
  if new.kind = 'runtime' and new.meter_reading is null and new.quantity is not null then
    new.meter_reading := coalesce(s.hour_meter, 0) + new.quantity;
  end if;
  if new.kind = 'runtime' and new.quantity is null and new.meter_reading is not null and s.hour_meter is not null then
    if new.meter_reading < s.hour_meter then
      raise exception 'The hour meter can''t go backwards (last reading %)', s.hour_meter;
    end if;
    new.quantity := new.meter_reading - s.hour_meter;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_power_logs_before on public.power_logs;
create trigger trg_power_logs_before before insert on public.power_logs
  for each row execute function public.power_log_before();

create or replace function public.power_log_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('runtime', 'reading', 'service') and new.meter_reading is not null then
    update public.power_sources set hour_meter = greatest(coalesce(hour_meter, 0), new.meter_reading), updated_at = now()
    where id = new.source_id and kind = 'generator';
  end if;
  if new.kind = 'service' then
    update public.power_sources
    set last_service_on = greatest(coalesce(last_service_on, new.log_date), new.log_date),
        last_service_hours = coalesce(new.meter_reading, hour_meter, last_service_hours),
        service_reminded_at = null, updated_at = now()
    where id = new.source_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_power_logs_after on public.power_logs;
create trigger trg_power_logs_after after insert on public.power_logs
  for each row execute function public.power_log_after();

create or replace function public.power_sources_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.kind <> 'generator' then
    new.fuel_type := null; new.tank_litres := null; new.service_interval_hours := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_power_sources_touch on public.power_sources;
create trigger trg_power_sources_touch before insert or update on public.power_sources
  for each row execute function public.power_sources_touch();

-- Helpers -------------------------------------------------------------------
create or replace function public.is_power_manager(p_org uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'power.manage') and public.user_has_branch_access(p_org, p_branch);
$$;
grant execute on function public.is_power_manager(uuid, uuid) to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.power_sources enable row level security;
alter table public.power_logs enable row level security;

drop policy if exists power_sources_all on public.power_sources;
create policy power_sources_all on public.power_sources
  for all using (public.is_power_manager(organization_id, branch_id))
  with check (public.is_power_manager(organization_id, branch_id) and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists power_logs_select on public.power_logs;
create policy power_logs_select on public.power_logs
  for select using (public.is_power_manager(organization_id, branch_id));
drop policy if exists power_logs_insert on public.power_logs;
create policy power_logs_insert on public.power_logs
  for insert with check (
    public.org_has_feature(organization_id, 'hr_module')
    and exists (select 1 from public.power_sources s where s.id = source_id and s.organization_id = power_logs.organization_id
                and public.is_power_manager(s.organization_id, s.branch_id))
  );
-- Mistakes are deleted and re-entered (no silent edits to money records);
-- only the person who logged it, within 7 days, or a partner.
drop policy if exists power_logs_delete on public.power_logs;
create policy power_logs_delete on public.power_logs
  for delete using (
    public.is_power_manager(organization_id, branch_id)
    and ((created_by = auth.uid() and created_at > now() - interval '7 days') or public.is_partner_or_above(organization_id))
  );

grant select, insert, update, delete on public.power_sources to authenticated;
grant select, insert, delete on public.power_logs to authenticated;

-- Service reminders ---------------------------------------------------------
-- Daily: generators within 10% of (or past) their service interval, not yet
-- reminded since the last service, notify that branch's facility managers.
create or replace function public.run_power_service_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare s record; v_n integer := 0;
begin
  for s in
    select * from public.power_sources
    where kind = 'generator' and active and service_interval_hours is not null and hour_meter is not null
      and service_reminded_at is null
      and hour_meter - coalesce(last_service_hours, 0) >= service_interval_hours * 0.9
  loop
    perform public.notify_user(s.organization_id, m.user_id, null, 'hr'::public.notification_category, 'power.service_due', 'power_source', s.id,
      s.name || ' is due for service (' || round(s.hour_meter - coalesce(s.last_service_hours, 0)) || ' of ' || s.service_interval_hours || ' hours run)',
      'warning'::public.notification_priority)
    from public.memberships m
    where m.organization_id = s.organization_id and m.status = 'active'
      and public.member_has_permission(s.organization_id, m.user_id, 'power.manage')
      and public.member_has_branch_access(s.organization_id, m.user_id, s.branch_id);
    update public.power_sources set service_reminded_at = now() where id = s.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.run_power_service_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'power-service-reminders') then
    perform cron.unschedule('power-service-reminders');
  end if;
  perform cron.schedule('power-service-reminders', '0 7 * * *', 'select public.run_power_service_reminders()');
end $$;
