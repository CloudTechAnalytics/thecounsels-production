-- ============================================================================
-- Migration 0086 — Fix log_audit() ambiguous-overload bug.
--
-- Three separate versions of log_audit() have been piling up since 0021:
-- a 6-argument one (0004), a 7-argument one (0021), and an 8-argument one
-- (0074, this session). Each later migration used CREATE OR REPLACE with
-- a DIFFERENT argument count, which in Postgres creates a new overload
-- rather than replacing the old one — the exact mistake explicitly caught
-- and avoided for send_hr_announcement() in 0084, but missed here. With
-- three overloads live, a call using fewer than 8 arguments can become
-- ambiguous ("function log_audit(...) is not unique"), which is exactly
-- what broke leave requests (request_leave() calls log_audit with 6
-- positional arguments internally).
--
-- Fix: drop the two obsolete overloads, leaving exactly one authoritative
-- 8-argument version.
-- ============================================================================

drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb);
drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb, boolean);

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false,
  p_actor_id uuid default null
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.audit_logs;
begin
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata, is_platform_action)
  values (p_org, coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid) to authenticated;
