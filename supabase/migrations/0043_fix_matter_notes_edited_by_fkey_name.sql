-- ============================================================================
-- Migration 0043 — Ensure matter_notes' edited_by FK is named exactly
-- matter_notes_edited_by_fkey, whatever Postgres actually auto-generated.
--
-- 0042 added `edited_by uuid references public.profiles(id) ...` via
-- ALTER TABLE ADD COLUMN. matters.service.ts's listNotes() query now
-- disambiguates two FKs from matter_notes to profiles (author_id and
-- edited_by) using explicit constraint-name hints, required once a table
-- has more than one FK to the same target — PostgREST otherwise can't tell
-- which relationship you mean and rejects the whole query. If the
-- auto-generated name isn't exactly matter_notes_edited_by_fkey, that
-- rejection fails the ENTIRE notes list (not just the new column) with an
-- unresolved-relationship error — the exact symptom reported: notes exist
-- in the table but never render.
-- ============================================================================

do $$
declare
  current_name text;
begin
  select con.conname into current_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'matter_notes'
    and con.contype = 'f'
    and att.attname = 'edited_by';

  if current_name is not null and current_name <> 'matter_notes_edited_by_fkey' then
    execute format('alter table public.matter_notes rename constraint %I to matter_notes_edited_by_fkey', current_name);
  end if;
end $$;
