-- ============================================================================
-- Migration 0088 — Add leave_requests to the realtime publication.
--
-- Needed for the sidebar's live "pending leave" badge — without this, the
-- badge's postgres_changes subscription would never fire, silently never
-- updating until the next manual refetch (page navigation). Same guarded
-- pattern 0061 used for the messaging tables.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests'
  ) then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
end $$;
