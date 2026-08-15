-- ============================================================================
-- Migration 0102 — AI Chat: conversational follow-up on a matter, building
-- on the one-shot AI Matter Summary (0070). Per-user, not a shared team
-- thread — each lawyer's own conversation with the AI about a given
-- matter. Same plan gate as the summary (ai_summarization, Business+) —
-- this is "more AI on a matter," not a separate capability tier.
--
-- No insert/update/delete policy — the chat-with-matter Edge Function
-- (service-role) is the only writer, for both the user's message and the
-- AI's reply, inserted together in one call. Matches direct_conversations/
-- employee_onboarding's existing "RPC/Edge-Function-only" pattern in this
-- codebase — a client can never forge either side of the conversation.
-- ============================================================================

create table public.matter_ai_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index idx_matter_ai_chat_matter_user on public.matter_ai_chat_messages (matter_id, user_id, created_at);

alter table public.matter_ai_chat_messages enable row level security;

create policy "matter_ai_chat_messages_select" on public.matter_ai_chat_messages
  for select using (user_id = auth.uid() and public.has_matter_access(matter_id));
