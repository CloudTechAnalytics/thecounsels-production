-- ============================================================================
-- Migration 0019 — Support Tickets (firm-raised, platform-managed) + threads.
-- ============================================================================

create type public.ticket_status as enum ('open', 'in_progress', 'waiting', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');

-- Per-year running counter for human-friendly ticket numbers (platform-wide).
create table public.ticket_counters (
  year int primary key,
  seq  int not null default 0
);

create table public.support_tickets (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  ticket_number      text,
  subject            text not null,
  status             public.ticket_status not null default 'open',
  priority           public.ticket_priority not null default 'medium',
  created_by         uuid references public.profiles(id) on delete set null,
  assignee_id        uuid references public.profiles(id) on delete set null,
  support_session_id uuid references public.support_sessions(id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_support_tickets_org on public.support_tickets (organization_id, created_at desc);
create index idx_support_tickets_status on public.support_tickets (status, priority);

create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- Assign TKT-<year>-<seq> on insert.
create or replace function public.assign_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if new.ticket_number is not null and new.ticket_number <> '' then
    return new;
  end if;
  insert into public.ticket_counters (year, seq)
    values (y, 1)
    on conflict (year) do update set seq = public.ticket_counters.seq + 1
    returning seq into n;
  new.ticket_number := 'TKT-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

create trigger trg_support_tickets_number
  before insert on public.support_tickets
  for each row execute function public.assign_ticket_number();

-- Stamp/clear resolved_at as status crosses the resolved boundary.
create or replace function public.stamp_ticket_resolved()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger trg_support_tickets_resolved
  before update of status on public.support_tickets
  for each row execute function public.stamp_ticket_resolved();

-- Threaded replies ----------------------------------------------------------
create table public.support_ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  from_platform boolean not null default false,
  body          text not null,
  created_at    timestamptz not null default now()
);

create index idx_ticket_messages_ticket on public.support_ticket_messages (ticket_id, created_at);

-- Stamp the sender's side server-side (client input is not trusted) and
-- surface new replies by bumping the parent ticket's updated_at.
create or replace function public.prepare_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := auth.uid();
  new.from_platform := public.is_platform_admin();
  update public.support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

create trigger trg_ticket_messages_prepare
  before insert on public.support_ticket_messages
  for each row execute function public.prepare_ticket_message();

-- RLS ------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.ticket_counters enable row level security;
-- ticket_counters: only touched via the SECURITY DEFINER trigger; no policies.

create policy "support_tickets_select" on public.support_tickets
  for select using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "support_tickets_insert" on public.support_tickets
  for insert with check (public.is_platform_admin() or public.is_org_member(organization_id));

-- Platform staff triage; firm members may also update their own firm's tickets
-- (e.g. close a request that resolved itself).
create policy "support_tickets_update" on public.support_tickets
  for update using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "ticket_messages_select" on public.support_ticket_messages
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (public.is_platform_admin() or public.is_org_member(t.organization_id))
    )
  );

create policy "ticket_messages_insert" on public.support_ticket_messages
  for insert with check (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (public.is_platform_admin() or public.is_org_member(t.organization_id))
    )
  );
