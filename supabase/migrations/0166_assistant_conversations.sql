-- ============================================================================
-- Migration 0166 — Assistant chat gets real conversations (ChatGPT-style).
--
-- Previously assistant_messages was one continuous, ever-growing log per
-- (org, user) — "Clear chat" wiped the whole thing at once because there
-- was no concept of separate threads. This adds a genuine conversations
-- table and links messages to one, so the UI can show a sidebar of past
-- chats and delete them individually.
--
-- Existing history is preserved, not discarded: every (org, user) pair
-- with existing messages gets exactly one "Previous conversation" row,
-- and every one of their existing messages is linked to it.
-- ============================================================================

create table public.assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null default 'New chat',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_assistant_conversations_user on public.assistant_conversations (user_id, organization_id, updated_at desc);

alter table public.assistant_conversations enable row level security;

-- Select + delete are self-service (same "a user managing their own chat
-- history" reasoning 0127 already established for message deletion) —
-- insert/update stay Edge-Function-only (service role), so a client can
-- never forge a conversation's ownership or backdate its activity.
create policy "assistant_conversations_select" on public.assistant_conversations
  for select using (user_id = auth.uid());
create policy "assistant_conversations_delete" on public.assistant_conversations
  for delete using (user_id = auth.uid());

alter table public.assistant_messages
  add column conversation_id uuid references public.assistant_conversations(id) on delete cascade;

-- Backfill: one legacy conversation per (org, user) that already has
-- messages, spanning their real first/last message timestamps.
insert into public.assistant_conversations (organization_id, user_id, title, created_at, updated_at)
select organization_id, user_id, 'Previous conversation', min(created_at), max(created_at)
from public.assistant_messages
where conversation_id is null
group by organization_id, user_id;

update public.assistant_messages m
set conversation_id = c.id
from public.assistant_conversations c
where m.conversation_id is null
  and m.organization_id = c.organization_id
  and m.user_id = c.user_id
  and c.title = 'Previous conversation';

-- Every message belongs to a conversation from here on — the Edge
-- Function always creates or resolves one before inserting.
alter table public.assistant_messages alter column conversation_id set not null;

create index idx_assistant_messages_conversation on public.assistant_messages (conversation_id, created_at);
