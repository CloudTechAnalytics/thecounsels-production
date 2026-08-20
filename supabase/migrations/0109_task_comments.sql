-- ============================================================================
-- Migration 0109 — Task detail access fix + task comments (reply thread).
--
-- tasks_select today is a pure has_permission(org, 'tasks.view') check —
-- unlike tasks_update, it has no bypass for the assignee/creator themselves.
-- An assignee without the broader tasks.view permission can't reliably see
-- their own assigned task, which would break a task detail page for exactly
-- that user. has_task_access() mirrors tasks_update's own existing OR-bypass
-- shape (not matters' AND-gated has_matter_access — verified directly,
-- tasks_update already establishes tasks' own convention as a pure OR),
-- extended to also bypass for the task's creator (not just assignee),
-- since the creator is the other half of "reply to whoever assigned it"
-- and needs to see the thread too.
-- ============================================================================
create or replace function public.has_task_access(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (
        public.has_permission(t.organization_id, 'tasks.view')
        or t.assignee_id = auth.uid()
        or t.created_by = auth.uid()
      )
  );
$$;

grant execute on function public.has_task_access(uuid) to authenticated;

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (public.has_task_access(id));

-- ----------------------------------------------------------------------------
-- task_comments — plain user-to-user reply thread, NOT the Edge-Function-
-- only pattern matter_ai_chat_messages uses (there's no AI mediating this,
-- both sides are real users who can write directly). Append-only in v1 —
-- no update/delete policy, matching the AI chat panel's own precedent of
-- not wiring delete, and the actual ask ("view and write back") rather
-- than "manage a comment history."
-- ----------------------------------------------------------------------------
create table public.task_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id         uuid not null references public.tasks(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index idx_task_comments_task on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy "task_comments_select" on public.task_comments
  for select using (public.has_task_access(task_id));

-- Same closed-matter "gate new activity, not historical read access" rule
-- already applied to documents/hearings/matter_notes — mirrors
-- matter_notes_insert's exact shape (0050), just joined through tasks for
-- matter_id since task_comments doesn't carry it directly.
create policy "task_comments_insert" on public.task_comments
  for insert with check (
    user_id = auth.uid()
    and public.has_task_access(task_id)
    and coalesce((
      select t.matter_id is null or public.matter_is_open(t.matter_id)
      from public.tasks t where t.id = task_id
    ), false)
  );

-- ----------------------------------------------------------------------------
-- notify_task_comment — modeled directly on notify_task_completed's own
-- pattern (compare auth.uid() to the "other side," skip self-notify).
-- Recipient is whichever of assignee/creator didn't just post. Uses the
-- generic notify_task_event primitive (in-app only) rather than the
-- heavier dispatch_task_notification (which also does email/WhatsApp) —
-- a comment reply is a lighter-weight event than a reminder.
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  recipient uuid;
  actor_name text;
begin
  select id, organization_id, matter_id, title, assignee_id, created_by into t
    from public.tasks where id = new.task_id;

  recipient := case when new.user_id = t.assignee_id then t.created_by else t.assignee_id end;
  if recipient is null or recipient = new.user_id then
    return new;
  end if;

  select full_name into actor_name from public.profiles where id = new.user_id;
  perform public.notify_task_event(
    t.organization_id, t.id, t.matter_id, recipient, new.user_id,
    'task_comment', coalesce(actor_name, 'Someone') || ' replied on: ' || t.title, 'info'
  );
  return new;
end;
$$;

create trigger trg_task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_task_comment();
