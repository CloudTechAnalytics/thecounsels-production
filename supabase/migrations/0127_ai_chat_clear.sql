-- ============================================================================
-- Migration 0127 — Let users clear their own AI chat history.
--
-- matter_ai_chat_messages and assistant_messages previously had a
-- SELECT-only policy each — by design, since chat-with-matter/ask-assistant
-- (service-role) are meant to be the only writers for INSERT. That
-- reasoning doesn't extend to DELETE: a user clearing their own chat log is
-- pure self-service cleanup, no different in kind from the DM "delete chat"
-- feature (0123) — scoped strictly to their own rows via user_id = auth.uid(),
-- same as the existing SELECT policy already trusts.
-- ============================================================================

create policy matter_ai_chat_messages_delete on public.matter_ai_chat_messages
for delete
using (user_id = auth.uid());

create policy assistant_messages_delete on public.assistant_messages
for delete
using (user_id = auth.uid());
