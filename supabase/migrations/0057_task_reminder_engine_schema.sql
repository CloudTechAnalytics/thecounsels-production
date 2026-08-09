-- ============================================================================
-- Migration 0057 — Task & Meeting Notification/Reminder Engine, Part A: schema.
--
-- Additive-only. Adds what the reminder engine (0058/0059) and its UI (Part
-- E/F) need: a 'cancelled' task status, dedup/audit columns on tasks so the
-- scheduler never double-sends, WhatsApp + per-event-type columns on
-- notification_preferences, and a new notification_log table — the per-
-- channel delivery audit trail §11 of the spec asks for. pg_net is the
-- documented Supabase mechanism for a pg_cron job to call an Edge Function
-- (net.http_post), used starting in migration 0059.
-- ============================================================================

alter type public.task_status add value if not exists 'cancelled';

alter table public.tasks
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists is_overdue boolean not null default false,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz,
  add column if not exists overdue_last_notified_at timestamptz;

-- notification_preferences: WhatsApp delivery + per-event-type channel
-- prefs. Kept as one JSONB column (task_channel_prefs) rather than ~10
-- booleans — same 5 event-type x {email, whatsapp} shape, extensible later
-- without another migration. In-app is intentionally NOT in this JSONB —
-- task-assignment in-app notifications stay the one always-on "critical"
-- channel (never user-disableable), matching notify_task_assigned's
-- existing unconditional behavior (0044).
alter table public.notification_preferences
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists whatsapp_number text,
  add column if not exists task_channel_prefs jsonb not null default '{
    "assigned":   {"email": true, "whatsapp": true},
    "due_soon":   {"email": true, "whatsapp": true},
    "overdue":    {"email": true, "whatsapp": true},
    "completed":  {"email": true, "whatsapp": true},
    "reassigned": {"email": true, "whatsapp": true}
  }'::jsonb;

-- ----------------------------------------------------------------------------
-- notification_log — auditable per-channel delivery record (spec §11).
-- Written exclusively by SECURITY DEFINER functions (notify_task_event,
-- dispatch_task_reminder) and the service-role send-task-notification Edge
-- Function — never directly by a client, same posture as `notifications`.
-- ----------------------------------------------------------------------------
create table public.notification_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  actor_id          uuid references public.profiles(id) on delete set null, -- who caused it; null for system/scheduler-generated events
  task_id           uuid references public.tasks(id) on delete cascade,
  notification_type text not null, -- 'task_assigned' | 'task_due_24h' | 'task_due_1h' | 'task_overdue' | 'task_completed' | 'task_reassigned'
  channel           text not null check (channel in ('IN_APP','EMAIL','WHATSAPP')),
  status            text not null default 'PENDING' check (status in ('PENDING','SENT','DELIVERED','FAILED')),
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  failure_reason    text
);

create index idx_notification_log_task on public.notification_log (task_id);
create index idx_notification_log_user on public.notification_log (user_id, created_at desc);
create index idx_notification_log_org on public.notification_log (organization_id, created_at desc);

alter table public.notification_log enable row level security;

-- Tenant isolation: a user sees only their own delivery log, or their org
-- admin sees the firm's — never another organization's rows (spec §16).
create policy "notification_log_select" on public.notification_log
  for select using (user_id = auth.uid() or public.is_org_admin(organization_id));
-- No insert/update policy — every write goes through SECURITY DEFINER
-- functions or the service-role Edge Function, which bypass RLS entirely.

create extension if not exists pg_net;
