-- ============================================================================
-- Migration 0126 — Same branch-access bypass as 0125, found in two more
-- places while auditing every has_*_access-shaped function/policy for the
-- same anti-pattern after 0125 fixed matter_row_access/has_matter_access.
--
-- has_task_access() (backs tasks_select) and the appointments_select policy
-- both had:
--   has_permission(view) and (matter_id is not null or branch_id is null or
--     user_has_branch_access(...))
-- The `matter_id is not null` arm short-circuits the OR to true regardless
-- of branch/assignment — so anyone holding tasks.view / appointments.view
-- (nearly every fee-earner role) could see ANY matter-linked task or
-- appointment in the org, regardless of matter_assignments or branch.
--
-- Every sibling policy on these same two tables (insert/update/delete) was
-- already written correctly — routing matter-linked rows through
-- has_matter_access(matter_id) instead — as are documents_select and
-- hearings_select. Only these two SELECT paths still had the old shape,
-- almost certainly just missed when 0125 fixed matter_row_access itself.
-- Confirmed via direct pg_policies/pg_proc inspection, not assumption.
--
-- Fix: matter-linked rows now go through has_matter_access(matter_id) —
-- the same personal-connection (assignee/lead/creator) + branch check
-- every other policy on these tables already uses. tasks keeps its
-- existing assignee/created_by carve-out untouched.
-- ============================================================================

create or replace function public.has_task_access(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (
        (
          public.has_permission(t.organization_id, 'tasks.view')
          and (
            (t.matter_id is not null and public.has_matter_access(t.matter_id))
            or (t.matter_id is null and (t.branch_id is null or public.user_has_branch_access(t.organization_id, t.branch_id)))
          )
        )
        or t.assignee_id = auth.uid()
        or t.created_by = auth.uid()
      )
  );
$function$;

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
for select
using (
  has_permission(organization_id, 'appointments.view'::text)
  and (
    ((matter_id is not null) and has_matter_access(matter_id))
    or ((matter_id is null) and ((branch_id is null) or user_has_branch_access(organization_id, branch_id)))
  )
);
