-- ============================================================================
-- Migration 0117 — log_audit() gets p_branch_id, audit_logs gets branch_id.
--
-- Explicitly DROP the existing 8-argument signature before creating the new
-- 9-argument one — CREATE OR REPLACE with a different argument count
-- creates a NEW overload instead of replacing the old one in Postgres,
-- which is exactly the bug 0087 fixed after earlier migrations each added
-- a log_audit overload with a different arg count and left ambiguous-call
-- errors in production. p_branch_id is a new *trailing, optional* (default
-- null) parameter — every existing caller uses NAMED parameters via
-- supabase.rpc('log_audit', {...}), so every existing call site across the
-- frontend and Edge Functions is unaffected by this addition.
-- ============================================================================

alter table public.audit_logs
  add column branch_id uuid references public.branches(id) on delete set null;

drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid);

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false,
  p_actor_id uuid default null,
  p_branch_id uuid default null
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.audit_logs;
begin
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata, is_platform_action, branch_id)
  values (p_org, coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform, p_branch_id)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid, uuid) to authenticated;
