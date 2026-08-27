-- ============================================================================
-- Migration 0142 — Every user gets a real notification_preferences row,
-- automatically, from day one — not silently zero rows until someone
-- happens to visit Settings and save once.
--
-- Found while investigating "nobody got the hearing reminder email":
-- notification_preferences had ZERO rows at all on this project, for any
-- of its users. dispatch_hearing_notification (and the equivalent task
-- path) reads that table with `select ... into prefs`; when no row
-- matches, every field on `prefs` comes back null, and
-- `coalesce(prefs.email_enabled, false)` — the exact line deciding
-- whether to even attempt an email — resolves to false. So this wasn't
-- about a dormant mailbox or anything email-provider-side: no user on
-- this project could ever have received a reminder email, for anything,
-- until they personally visited Settings and saved a preference once
-- (the only place a row gets created today, via upsert).
--
-- Fix: backfill a real row for every existing profile, and a trigger so
-- every new one gets provisioned the same way going forward — email on
-- by default for something as consequential as a hearing reminder is the
-- right default, not an opt-in nobody knows to look for.
-- ============================================================================

insert into public.notification_preferences (user_id, in_app_enabled, browser_enabled, email_enabled, sms_enabled, whatsapp_enabled, task_channel_prefs)
select
  p.id, true, false, true, false, false,
  '{
    "assigned":   {"email": true, "whatsapp": true},
    "due_soon":   {"email": true, "whatsapp": true},
    "overdue":    {"email": true, "whatsapp": true},
    "completed":  {"email": true, "whatsapp": true},
    "reassigned": {"email": true, "whatsapp": true},
    "hearing_reminder": {"email": true, "whatsapp": true}
  }'::jsonb
from public.profiles p
where not exists (select 1 from public.notification_preferences np where np.user_id = p.id);

create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (user_id, in_app_enabled, browser_enabled, email_enabled, sms_enabled, whatsapp_enabled, task_channel_prefs)
  values (
    new.id, true, false, true, false, false,
    '{
      "assigned":   {"email": true, "whatsapp": true},
      "due_soon":   {"email": true, "whatsapp": true},
      "overdue":    {"email": true, "whatsapp": true},
      "completed":  {"email": true, "whatsapp": true},
      "reassigned": {"email": true, "whatsapp": true},
      "hearing_reminder": {"email": true, "whatsapp": true}
    }'::jsonb
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_default_notification_preferences on public.profiles;
create trigger trg_create_default_notification_preferences
  after insert on public.profiles
  for each row execute function public.create_default_notification_preferences();
