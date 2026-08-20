-- ============================================================================
-- Migration 0111 — General AI Assistant chat history.
--
-- Backs the new ask-assistant Edge Function: a schedule/workload assistant
-- ("show upcoming hearings this week with client names and advocates"),
-- distinct from the existing per-matter AI (summarize-matter/chat-with-
-- matter, 0070/0102) which is scoped to one matter's own context.
--
-- Conversation is persisted per-user, not per-matter or per-org-wide
-- thread — organization_id is still stored (for admin/debugging visibility
-- and so a user switching firms doesn't see a mixed history), but the
-- select policy scopes strictly to the caller's own messages.
--
-- No insert/update/delete policy — same "Edge-Function-only writer"
-- pattern as matter_ai_chat_messages (0102): a client can never forge
-- either side of the conversation.
-- ============================================================================

create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index idx_assistant_messages_user on public.assistant_messages (user_id, created_at);

alter table public.assistant_messages enable row level security;

create policy "assistant_messages_select" on public.assistant_messages
  for select using (user_id = auth.uid());
