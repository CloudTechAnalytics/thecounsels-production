-- ============================================================================
-- Migration 0035 — Notify a team member when they're removed from a matter.
--
-- Mirrors notify_matter_team_assigned (0030) for the removal case, so
-- someone finds out why a matter disappeared from their list instead of it
-- just silently vanishing. Same cascade-safety guard as
-- track_matter_assignment_removed (0033) — skip when the matter itself is
-- being deleted in the same breath (removal from a matter that no longer
-- exists at all isn't a meaningful "you were removed" event, and matches
-- the existing "no notification about a matter that's gone" behavior).
-- ============================================================================

create or replace function public.notify_matter_team_unassigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
begin
  if not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;
  if auth.uid() is not null and old.user_id = auth.uid() then
    return old; -- someone removing themselves doesn't need telling
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select title into matter_title from public.matters where id = old.matter_id;
  perform public.notify_user(old.organization_id, old.user_id, auth.uid(), 'matters', 'matter.unassigned',
    'matter', old.matter_id,
    coalesce(actor_name, 'Someone') || ' removed you from ' || coalesce(matter_title, 'a matter'), 'warning');
  return old;
end $$;

drop trigger if exists trg_notify_matter_team_unassigned on public.matter_assignments;
create trigger trg_notify_matter_team_unassigned
  after delete on public.matter_assignments
  for each row execute function public.notify_matter_team_unassigned();
