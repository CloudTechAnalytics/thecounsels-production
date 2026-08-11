-- ============================================================================
-- Migration 0070 — AI matter summarization, gated to Business/Enterprise.
--
-- Reuses plans.features (already existed, dormant) rather than adding a new
-- column — it's exactly the extensible "what does this plan unlock" bag the
-- schema already provides. { "ai_summarization": true } on Business and
-- Enterprise only. The actual enforcement lives server-side in the
-- summarize-matter Edge Function (checks this same flag via the service-role
-- client) — the frontend flag here only controls what's *shown*; a client-
-- only gate would be trivially bypassable, same principle as every other
-- access check in this app.
-- ============================================================================

update public.plans
set features = features || '{"ai_summarization": true}'::jsonb
where key in ('business', 'enterprise');

-- Persisted so a summary doesn't need regenerating (and re-billing an API
-- call) every time the matter is opened — shown with a "Regenerate" action.
alter table public.matters
  add column if not exists ai_summary text,
  add column if not exists ai_summary_generated_at timestamptz;
