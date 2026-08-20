-- ============================================================================
-- Migration 0107 — Fix ambiguous "title" reference in run_hearing_reminders().
--
-- The function declares a local variable named `title` (used to build each
-- notification's text) while its own query selects public.hearings.title
-- into the same FOR loop — Postgres can't tell which `title` the SELECT
-- list means, so every single run has failed since the hearing reminder
-- engine was first deployed:
--   ERROR: column reference "title" is ambiguous
--   ... It could refer to either a PL/pgSQL variable or a table column.
-- Confirmed via cron.job_run_details on both Testing and Production —
-- every run failed, not a one-off. run_task_reminders() never hit this
-- because its own local variable isn't named to collide with a selected
-- column.
--
-- Fix: rename the local variable to v_title (matches the v_-prefix
-- convention already used elsewhere for exactly this reason) — no logic
-- change, just removes the naming collision.
-- ============================================================================
create or replace function public.run_hearing_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  recipient record;
  v_title text;
  matter_number text;
begin
  for h in
    select id, matter_id, title, hearing_at, court, reminder_24h_sent_at, reminder_1h_sent_at
    from public.hearings
    where status in ('scheduled', 'adjourned')
      and hearing_at > now()
  loop
    matter_number := null;
    if h.matter_id is not null then
      select m.matter_number into matter_number from public.matters m where m.id = h.matter_id;
    end if;

    if h.reminder_24h_sent_at is null and now() >= h.hearing_at - interval '24 hours' then
      v_title := 'Hearing tomorrow: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_24h', v_title);
      end loop;
      update public.hearings set reminder_24h_sent_at = now() where id = h.id;
    end if;

    if h.reminder_1h_sent_at is null and now() >= h.hearing_at - interval '1 hour' then
      v_title := 'Hearing in 1 hour: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_1h', v_title);
      end loop;
      update public.hearings set reminder_1h_sent_at = now() where id = h.id;
    end if;
  end loop;
end;
$$;
