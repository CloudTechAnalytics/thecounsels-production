-- ============================================================================
-- Migration 0025 — Notification Center Foundation.
--
-- Replaces the localStorage "seen" hack (platform-notifications.tsx) and the
-- audit_logs-as-notifications approach (notifications-page.tsx's old "Live
-- activity" panel) with a real per-user notifications table, populated by
-- triggers on the same write paths that already produce matter_events/
-- audit_logs entries — one event at a time, not a generic cross-table engine.
--
-- Recipient rule used throughout: notify the matter's lead_lawyer_id when
-- someone else acts on their matter (document/invoice/note), notify the
-- submitter when their own work gets approved (time entry), notify the newly
-- assigned lawyer on matter assignment. No recipient (null lead_lawyer_id, or
-- actor == recipient) simply means no row is inserted — not an error.
-- ============================================================================

create type public.notification_priority as enum ('info', 'reminder', 'warning', 'urgent');
create type public.notification_category as enum
  ('matters', 'clients', 'hearings', 'billing', 'tasks', 'documents', 'notes');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  category        public.notification_category not null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  title           text not null,
  priority        public.notification_priority not null default 'info',
  is_read         boolean not null default false,
  read_at         timestamptz,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_notifications_user_active on public.notifications (user_id, is_archived, created_at desc);
create index idx_notifications_user_unread on public.notifications (user_id, is_read) where not is_archived;

create table public.notification_preferences (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled  boolean not null default true,
  browser_enabled boolean not null default false,
  email_enabled   boolean not null default false,
  sms_enabled     boolean not null default false,
  updated_at      timestamptz not null default now()
);

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- notify_user — insert-only RPC, mirrors log_audit's shape. This is the *only*
-- way a row can land in notifications; there is no insert policy below, so a
-- user can never forge a notification for themselves or anyone else.
-- ----------------------------------------------------------------------------
create or replace function public.notify_user(
  p_org uuid,
  p_user uuid,
  p_actor uuid,
  p_category public.notification_category,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.notifications;
begin
  if p_user is null then
    return null;
  end if;
  insert into public.notifications
    (organization_id, user_id, actor_id, category, action, entity_type, entity_id, title, priority)
  values
    (p_org, p_user, p_actor, p_category, p_action, p_entity_type, p_entity_id, p_title, p_priority)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.notify_user(
  uuid, uuid, uuid, public.notification_category, text, text, uuid, text, public.notification_priority
) to authenticated;

-- ----------------------------------------------------------------------------
-- mark_all_notifications_read — bulk update, still scoped to the caller.
-- ----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read(p_org uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.notifications
    set is_read = true, read_at = now()
    where organization_id = p_org and user_id = auth.uid() and not is_read;
$$;

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid());

create policy "notification_preferences_select" on public.notification_preferences
  for select using (user_id = auth.uid());
create policy "notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy "notification_preferences_update" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Event triggers — the bounded, per-event set from the Foundation plan.
-- ----------------------------------------------------------------------------

-- 1. Matter assigned -----------------------------------------------------
create or replace function public.notify_matter_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.lead_lawyer_id is not null;
  else
    changed := new.lead_lawyer_id is not null and new.lead_lawyer_id is distinct from old.lead_lawyer_id;
  end if;

  if changed and (auth.uid() is null or new.lead_lawyer_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(new.organization_id, new.lead_lawyer_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' assigned you to ' || new.title, 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_matter_assigned on public.matters;
create trigger trg_notify_matter_assigned
  after insert or update of lead_lawyer_id on public.matters
  for each row execute function public.notify_matter_assigned();

-- 2. Document uploaded ----------------------------------------------------
create or replace function public.notify_document_uploaded()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  uploader uuid := coalesce(new.uploaded_by, auth.uid());
begin
  if new.matter_id is null then return new; end if;
  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead is null or lead = uploader then return new; end if;
  select full_name into actor_name from public.profiles where id = uploader;
  perform public.notify_user(new.organization_id, lead, uploader, 'documents', 'document.uploaded',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' uploaded ' || new.display_name, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_document_uploaded on public.documents;
create trigger trg_notify_document_uploaded
  after insert on public.documents
  for each row execute function public.notify_document_uploaded();

-- 3. Invoice created --------------------------------------------------------
create or replace function public.notify_invoice_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  creator uuid := coalesce(new.created_by, auth.uid());
begin
  if new.matter_id is null then return new; end if;
  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead is null or lead = creator then return new; end if;
  select full_name into actor_name from public.profiles where id = creator;
  perform public.notify_user(new.organization_id, lead, creator, 'billing', 'invoice.created',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' created invoice ' || new.invoice_number, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_invoice_created on public.invoices;
create trigger trg_notify_invoice_created
  after insert on public.invoices
  for each row execute function public.notify_invoice_created();

-- 4. Invoice paid -----------------------------------------------------------
create or replace function public.notify_invoice_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare lead uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.matter_id is not null then
    select lead_lawyer_id into lead from public.matters where id = new.matter_id;
    if lead is not null then
      perform public.notify_user(new.organization_id, lead, auth.uid(), 'billing', 'invoice.paid',
        'matter', new.matter_id, 'Invoice ' || new.invoice_number || ' was paid in full', 'reminder');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_invoice_paid on public.invoices;
create trigger trg_notify_invoice_paid
  after update of status on public.invoices
  for each row execute function public.notify_invoice_paid();

-- 5. Time entry approved -----------------------------------------------------
create or replace function public.notify_time_entry_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and new.user_id is not null and (auth.uid() is null or new.user_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(new.organization_id, new.user_id, auth.uid(), 'billing', 'time_entry.approved',
      'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' approved your time entry: ' || left(new.description, 60), 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_time_entry_approved on public.time_entries;
create trigger trg_notify_time_entry_approved
  after update of status on public.time_entries
  for each row execute function public.notify_time_entry_approved();

-- 6. Note added ---------------------------------------------------------------
create or replace function public.notify_note_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  matter_title text;
  author uuid := coalesce(new.author_id, auth.uid());
begin
  select lead_lawyer_id, title into lead, matter_title from public.matters where id = new.matter_id;
  if lead is null or lead = author then return new; end if;
  select full_name into actor_name from public.profiles where id = author;
  perform public.notify_user(new.organization_id, lead, author, 'notes', 'note.added',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' added a note on ' || matter_title, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_note_added on public.matter_notes;
create trigger trg_notify_note_added
  after insert on public.matter_notes
  for each row execute function public.notify_note_added();

-- ----------------------------------------------------------------------------
-- Realtime: stream notifications for the bell/badge and browser push.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
