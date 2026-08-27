-- ============================================================================
-- Migration 0143 — Close a race between immediate hearing-reminder
-- dispatch (0141, fires on create/reschedule) and the cron tick (now
-- every 10 minutes, also 0141) that can send the same reminder twice.
--
-- Caught live while verifying 0141/0142 on testing: resetting a hearing's
-- reminder flags to test the fix landed in the same narrow window as a
-- real cron tick, and both paths independently saw reminder_1h_sent_at
-- as null, both sent, both then set the flag — a duplicate email is
-- worse than a missed one, and this was a genuine check-then-act race,
-- not a one-off fluke: SELECT the flag, decide to send, THEN update the
-- flag has a window between the read and the write where a second
-- caller can make the same decision.
--
-- Fix: flip the order — UPDATE the flag from NULL to now() FIRST, and
-- only send if that UPDATE actually changed a row (GET DIAGNOSTICS
-- row_count). Whichever caller's UPDATE runs first atomically claims the
-- reminder; the other's UPDATE affects zero rows and sends nothing.
-- ============================================================================

create or replace function public.dispatch_hearing_reminders_if_due(p_hearing_id uuid)
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
  v_claimed int;
begin
  select id, matter_id, title, hearing_at, court, status, reminder_24h_sent_at, reminder_1h_sent_at
    into h from public.hearings where id = p_hearing_id;
  if h.id is null or h.status not in ('scheduled', 'adjourned') or h.hearing_at <= now() then
    return;
  end if;

  matter_number := null;
  if h.matter_id is not null then
    select m.matter_number into matter_number from public.matters m where m.id = h.matter_id;
  end if;

  if h.reminder_24h_sent_at is null and now() >= h.hearing_at - interval '24 hours' then
    update public.hearings set reminder_24h_sent_at = now()
      where id = p_hearing_id and reminder_24h_sent_at is null;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      v_title := 'Hearing tomorrow: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');
      for recipient in select * from public.hearing_recipients(h.id) loop
        perform public.dispatch_hearing_notification(h.id, recipient, 'hearing_reminder_24h', v_title);
      end loop;
    end if;
  end if;

  if h.reminder_1h_sent_at is null and now() >= h.hearing_at - interval '1 hour' then
    update public.hearings set reminder_1h_sent_at = now()
      where id = p_hearing_id and reminder_1h_sent_at is null;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      v_title := 'Hearing in 1 hour: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');
      for recipient in select * from public.hearing_recipients(h.id) loop
        perform public.dispatch_hearing_notification(h.id, recipient, 'hearing_reminder_1h', v_title);
      end loop;
    end if;
  end if;
end;
$$;
