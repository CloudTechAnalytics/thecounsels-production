-- ============================================================================
-- Migration 0168 — Refresh plan highlights (data only, no schema change).
--
-- Two real problems found while reviewing the pricing screens for this
-- work: Professional's highlights said "Everything in Starter" — 'starter'
-- is the plan's internal key, but its display name has been "Basic" for a
-- while, so this leaked internal naming into customer-facing copy. And
-- Business still listed "AI-powered matter summaries" as if it were a
-- Business-exclusive differentiator, which stopped being true the moment
-- ai_summarization moved to Professional — left as-is it would have wrongly
-- implied AI isn't available until Business.
--
-- PlanCard components only render the first 4 highlights
-- (plan.highlights.slice(0, 4)) on the actual pricing cards — reordered so
-- AI Workspace / HR Workspace land inside that visible slice for
-- Professional, matching the explicit product requirement that AI must
-- read as included starting at Professional, not Business.
-- ============================================================================

update public.plans set highlights = array[
  'Up to 3 users', 'Core matter management', 'Client management', 'Contacts',
  'Documents', 'Hearings & Calendar', 'Tasks', 'Email notifications',
  'Time tracking', 'Expenses', 'Basic billing & invoicing', 'Basic reports'
] where key = 'starter';

update public.plans set highlights = array[
  'Up to 10 users', 'Everything in Basic', 'AI Workspace', 'HR Workspace',
  'Team messaging (channels + DMs)', 'Email + WhatsApp reminders',
  'Advanced matter/case management', 'Advanced reports'
] where key = 'professional';

update public.plans set highlights = array[
  'Up to 25 users', 'Everything in Professional', 'Advanced HR & People Management',
  'Branch / multi-office support', 'Advanced analytics & reporting',
  'Advanced permissions', 'Workflow automation', 'Priority support'
] where key = 'business';

update public.plans set highlights = array[
  'Custom number of users', 'Everything in Business', 'Custom storage',
  'Custom integrations', 'Custom workflows', 'Custom support requirements'
] where key = 'enterprise';
