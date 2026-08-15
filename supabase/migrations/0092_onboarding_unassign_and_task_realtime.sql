-- ============================================================================
-- Migration 0091 — unassign onboarding + live task-completion status.
--
-- Two related fixes:
--
-- 1. "0/1 completed" never updated when the assignee actually finished
--    their task — the Onboarding page's progress queries are plain
--    TanStack Query fetches (30s staleTime, no window-focus refetch), so
--    completing a linked task in the Tasks module never told anyone
--    looking at the Onboarding page. Adding public.tasks to the realtime
--    publication lets the frontend subscribe to task UPDATEs and
--    invalidate the onboarding progress queries live.
--
-- 2. No way to remove a checklist that was assigned by mistake — only the
--    unused *template* could be deleted (0090-era ChecklistsCard), not an
--    actual assignment. unassign_onboarding() removes the
--    employee_onboarding row AND the real tasks it generated (not just
--    the links — an orphaned "Onboarding" task with no visible checklist
--    behind it would be confusing to leave in someone's task list).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

create or replace function public.unassign_onboarding(p_onboarding_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_user uuid;
  v_template uuid;
begin
  select organization_id, user_id, template_id into v_org, v_user, v_template
  from public.employee_onboarding where id = p_onboarding_id;

  if v_org is null then
    raise exception 'Onboarding assignment not found';
  end if;
  if not public.has_permission(v_org, 'onboarding.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  -- Removes the linked tasks outright (cascades their onboarding_task_links
  -- rows too) rather than leaving orphaned "Onboarding" tasks with no
  -- checklist behind them once the assignment itself is gone.
  delete from public.tasks
  where id in (select task_id from public.onboarding_task_links where employee_onboarding_id = p_onboarding_id);

  delete from public.employee_onboarding where id = p_onboarding_id;

  perform public.log_audit(v_org, 'onboarding.unassigned', 'employee_onboarding', p_onboarding_id,
    'Onboarding checklist unassigned', jsonb_build_object('template_id', v_template, 'user_id', v_user));
end;
$$;

grant execute on function public.unassign_onboarding(uuid) to authenticated;
