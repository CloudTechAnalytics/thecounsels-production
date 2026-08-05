-- ============================================================================
-- Migration 0042 — Editable matter notes.
--
-- matter_notes only ever supported add/delete — there was no UPDATE policy
-- at all, so any edit attempt would have been silently rejected by RLS.
-- Adds updated_at/edited_by tracking (updated_at stays null until the first
-- real edit, so the UI can tell "never edited" from "edited"), an UPDATE
-- policy mirroring the existing delete policy's authorization shape
-- (author, or a matters.update holder — both still gated by
-- has_matter_access per the P1 matter-access-control work), and a
-- note_edited timeline event mirroring the existing note_added one.
-- ============================================================================

alter table public.matter_notes
  add column if not exists updated_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

drop trigger if exists trg_matter_notes_updated_at on public.matter_notes;
create trigger trg_matter_notes_updated_at
  before update on public.matter_notes
  for each row execute function public.set_updated_at();

drop policy if exists "matter_notes_update" on public.matter_notes;
create policy "matter_notes_update" on public.matter_notes
  for update
  using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  )
  with check (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  );

create or replace function public.track_note_edited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.edited_by, auth.uid()), 'note_edited',
            'Edited a note: ' || left(new.body, 80));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_note_edited on public.matter_notes;
create trigger trg_track_note_edited
  after update on public.matter_notes
  for each row execute function public.track_note_edited();
