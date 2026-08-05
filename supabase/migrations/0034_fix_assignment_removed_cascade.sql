-- ============================================================================
-- Migration 0034 — Fix track_matter_assignment_removed during cascading
-- matter deletion. Same class of bug as 0028's track_document_removed fix.
--
-- trg_track_matter_assignment_removed (0030) fires AFTER DELETE on
-- matter_assignments and logs a matter_events row using OLD.organization_id
-- / OLD.matter_id. That's fine for a standalone unassignment (the matter
-- still exists), but matter_assignments.matter_id references matters(id)
-- ON DELETE CASCADE — so deleting a matter cascades into deleting its
-- matter_assignments rows too, firing this trigger while the matter row
-- it's about to reference is already gone, tripping
-- matter_events_matter_id_fkey and aborting the whole delete.
--
-- Fix: only log when the organization and matter this event would reference
-- are still actually there. A genuine standalone unassignment always has
-- both present; a cascading matter deletion does not, and the event would
-- be meaningless anyway — matter_events for that matter is being deleted in
-- the same breath (matter_events.matter_id is also ON DELETE CASCADE).
-- ============================================================================

create or replace function public.track_matter_assignment_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  if exists (select 1 from public.organizations where id = old.organization_id)
     and exists (select 1 from public.matters where id = old.matter_id)
  then
    select full_name into actor_name from public.profiles where id = auth.uid();
    select full_name into user_name from public.profiles where id = old.user_id;
    select matter_number into m_number from public.matters where id = old.matter_id;
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (old.organization_id, old.matter_id, auth.uid(), 'lawyer_removed',
      coalesce(actor_name, 'Someone') || ' removed ' || coalesce(user_name, 'a team member')
        || ' from Matter ' || coalesce(m_number, ''),
      jsonb_build_object('user_id', old.user_id));
  end if;
  return old;
end $$;

-- The RLS-test matter this same failure left half-deleted (its
-- matter_assignments row is already gone via cascade; only the matters row
-- itself remains) — clean it up now that the trigger won't block it.
delete from public.matters where title = 'RLS TEST — DELETE ME';
