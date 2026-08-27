-- ============================================================================
-- Migration 0145 — Client Communications: a real, logged, client-facing
-- correspondence feature. Confirmed with the user: build it now, not a
-- stand-in. Previously there was no way to actually send something to a
-- client from inside the app — Notes are internal-only, Messaging is
-- firm-staff-to-firm-staff, and Notifications never leave the firm.
--
-- Model: an outbound-only log (this is a record of what the firm sent, not
-- a two-way inbox) tied to a client (required) and optionally a matter.
-- Every row starts PENDING, gets emailed via the new send-client-
-- communication Edge Function (Resend, same provider/posture as
-- send-task-notification), and is flipped to SENT/FAILED by that function
-- using the service role — same shape as notification_log: nobody but the
-- delivering function ever updates a row after insert, so there's no
-- update/delete RLS policy for authenticated users at all.
-- ============================================================================

insert into public.permissions (key, resource, action, description)
values ('clients.communicate', 'clients', 'communicate', 'Send correspondence to a client')
on conflict (key) do nothing;

-- platform_owner/platform_admin/managing_partner/partner already hold every
-- permission (0067's cross join) — this adds the fee-earner tier, the same
-- roles that already hold clients.create/clients.update (0040/0041).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.key in ('senior_associate', 'associate', 'junior_associate')
  and p.key = 'clients.communicate'
on conflict do nothing;

create table public.client_communications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete set null,
  sent_by         uuid references public.profiles(id) on delete set null,
  recipient_name  text,
  recipient_email text not null,
  subject         text not null,
  body            text not null,
  status          text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  failure_reason  text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_client_communications_client on public.client_communications (client_id, created_at desc);
create index idx_client_communications_matter on public.client_communications (matter_id, created_at desc) where matter_id is not null;

alter table public.client_communications enable row level security;

-- Visibility piggybacks entirely on the clients table's own RLS (branch
-- scope, clients.view, etc.) via this subquery — same pattern as
-- hearing_supporting_lawyers_write (0144) referencing matters directly
-- rather than re-deriving the rule.
create policy "client_communications_select" on public.client_communications
  for select using (
    exists (select 1 from public.clients c where c.id = client_id)
  );

create policy "client_communications_insert" on public.client_communications
  for insert with check (
    public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- Timeline + in-app notification — fires once a send is CONFIRMED (status
-- transitions to SENT), not on insert, so a FAILED attempt never claims in
-- the timeline that an email actually went out. Matter-scoped only
-- (matter_events.matter_id is NOT NULL) — a client-level communication with
-- no matter attached has no timeline to log to, same posture as
-- track_document_added's `if new.matter_id is not null` guard.
-- ----------------------------------------------------------------------------
create or replace function public.track_client_communication_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  client_name text;
  matter_title text;
  matter_number text;
  title text;
begin
  if new.status = 'SENT' and old.status is distinct from 'SENT' and new.matter_id is not null then
    select full_name into actor_name from public.profiles where id = new.sent_by;
    select display_name into client_name from public.clients where id = new.client_id;
    select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, new.sent_by, 'client_communication_sent',
            'Emailed ' || coalesce(client_name, 'the client') || ': ' || new.subject,
            jsonb_build_object('client_communication_id', new.id, 'client_id', new.client_id));

    title := coalesce(actor_name, 'Someone') || ' emailed ' || coalesce(client_name, 'the client')
      || ' on ' || coalesce(matter_number, matter_title, 'a matter') || ': "' || new.subject || '"';

    perform public.notify_matter_team(new.organization_id, new.matter_id, new.sent_by,
      'clients', 'client.communication_sent', 'matter', new.matter_id, title, 'info');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_client_communication_sent on public.client_communications;
create trigger trg_track_client_communication_sent
  after update on public.client_communications
  for each row execute function public.track_client_communication_sent();
