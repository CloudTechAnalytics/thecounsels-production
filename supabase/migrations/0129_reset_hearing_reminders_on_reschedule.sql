-- ============================================================================
-- Migration 0129 — Reset hearing reminder flags when a hearing is rescheduled.
--
-- run_hearing_reminders() (0098) only ever sends the 24h/1h reminders once
-- per hearing — reminder_24h_sent_at/reminder_1h_sent_at are set and never
-- cleared. That's correct for a hearing that stays on its original date,
-- but if it's adjourned (or just edited) to a NEW hearing_at, those flags
-- are still set from the old date, so the engine silently thinks it
-- already reminded everyone and never fires again for the new date —
-- exactly backwards from what an adjournment needs.
--
-- Fix: whenever hearing_at actually changes, clear both flags in a BEFORE
-- UPDATE trigger — covers every write path (the adjourn flow being added
-- alongside this migration, the full edit form, any future one) from one
-- place, rather than relying on each caller to remember.
-- ============================================================================

create or replace function public.reset_hearing_reminders_on_reschedule()
returns trigger
language plpgsql
as $$
begin
  if new.hearing_at is distinct from old.hearing_at then
    new.reminder_24h_sent_at := null;
    new.reminder_1h_sent_at := null;
  end if;
  return new;
end;
$$;

create trigger trg_hearings_reset_reminders_on_reschedule
before update on public.hearings
for each row execute function public.reset_hearing_reminders_on_reschedule();
