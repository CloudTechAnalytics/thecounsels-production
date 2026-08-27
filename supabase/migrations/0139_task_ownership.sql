-- ============================================================================
-- Migration 0139 — Only the assignee can complete their own task; editing
-- narrows from "anyone with tasks.update" to the assignee or a manager.
--
-- Reported: any user holding the generic tasks.update permission — which
-- includes Paralegal, Secretary, Receptionist, Litigation Clerk, not just
-- fee-earners — could edit or mark done ANY task in a matter they have
-- access to, regardless of who it was actually assigned to. Confirmed via
-- the conversation this was fixed in: editing (due date, priority,
-- reassignment) should stay open to the assignee or a manager; only the
-- assignee should ever be able to mark it done — a colleague completing
-- someone else's assigned work on their behalf is a real integrity
-- problem (a false "I did this"), not just a permissions nicety.
--
-- Two changes:
--   1. tasks_update's permission check narrows from tasks.update (broad —
--      includes support staff) to tasks.assign (fee-earners/leadership —
--      the actual "manages the team's task assignments" permission
--      already in the system). assignee_id = auth.uid() stays as its own
--      OR-branch, unchanged, unaffected either way.
--   2. set_task_completion_fields() (0058) — already the trigger that
--      stamps completed_by/completed_at — now also enforces the rule
--      right there: transitioning a task TO 'done' requires being that
--      task's own assignee (or platform admin, for an audited support
--      session), when the task actually has an assignee at all. Other
--      status transitions (in_progress, cancelled, reopening) are
--      untouched — this is specifically about marking something done on
--      someone else's behalf, not status changes in general.
-- ============================================================================

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    (
      ((matter_id IS NOT NULL) AND has_matter_access(matter_id) AND matter_is_open(matter_id))
      OR ((matter_id IS NULL) AND ((branch_id IS NULL) OR user_has_branch_access(organization_id, branch_id)))
    )
    AND (has_permission(organization_id, 'tasks.assign'::text) OR (assignee_id = auth.uid()))
  )
  with check (
    (
      ((matter_id IS NOT NULL) AND has_matter_access(matter_id) AND matter_is_open(matter_id))
      OR ((matter_id IS NULL) AND ((branch_id IS NULL) OR user_has_branch_access(organization_id, branch_id)))
    )
    AND (has_permission(organization_id, 'tasks.assign'::text) OR (assignee_id = auth.uid()))
  );

create or replace function public.set_task_completion_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    if old.assignee_id is not null and old.assignee_id <> auth.uid() and not public.is_platform_admin() then
      raise exception 'Only the person this task is assigned to can mark it done' using errcode = '42501';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;
