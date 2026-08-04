-- ============================================================================
-- Migration 0028 — Fix track_document_removed during cascading deletes.
--
-- trg_track_document_removed (0012) fires AFTER DELETE on documents and logs
-- a matter_events row using OLD.organization_id / OLD.matter_id. That's fine
-- for a standalone document deletion, but when the document is being removed
-- as part of a larger cascade (deleting its matter, or the whole
-- organization via hard_delete_organization), the organization and/or matter
-- row it's about to reference has *already* been deleted earlier in that
-- same cascading DELETE statement — so the INSERT trips
-- matter_events_organization_id_fkey (or _matter_id_fkey), aborting the
-- whole delete. This is exactly what broke "Delete forever" after 0027
-- fixed the auth.users issue.
--
-- Fix: only log when the organization and matter this event would reference
-- are still actually there. A genuine standalone document removal always
-- has both present; a cascading wipe of either does not, and the event
-- would be meaningless anyway (it — and everything else about that matter
-- or org — is being deleted in the same breath).
-- ============================================================================
create or replace function public.track_document_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.matter_id is not null
     and exists (select 1 from public.organizations where id = old.organization_id)
     and exists (select 1 from public.matters where id = old.matter_id)
  then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (old.organization_id, old.matter_id, auth.uid(), 'document_removed', 'Removed ' || old.name);
  end if;
  return old;
end $$;
