-- ============================================================================
-- Migration 0023 — Documents overhaul: friendly display names + a
-- document_renamed Timeline event.
--
-- `name` (the original uploaded filename) stays immutable — it's the identity
-- tied to storage. `display_name` is the new user-facing, editable label,
-- backfilled from `name` for existing rows.
-- ============================================================================

alter table public.documents add column if not exists display_name text;
update public.documents set display_name = name where display_name is null;
alter table public.documents alter column display_name set not null;

create or replace function public.track_document_renamed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null and old.display_name is distinct from new.display_name then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'document_renamed',
            'Renamed document to ' || new.display_name, jsonb_build_object('document_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_document_renamed on public.documents;
create trigger trg_track_document_renamed
  after update on public.documents for each row execute function public.track_document_renamed();
