-- ============================================================================
-- Migration 0100 — Plan-Based Feature Gating, Part A: foundation.
--
-- Only two things have ever been genuinely plan-gated: seat count
-- (max_users) and AI matter summarization (ai_summarization, added 0070).
-- Everything else — the highlights marketing bullets, and the Platform
-- Console's PLAN_FEATURES checklist — is decorative, and the checklist
-- itself is stale (lists features from the original 0006 seed that were
-- never built: case_management, sso, api_access, custom_branding,
-- advanced_security, document_versioning, ai_features — none ever
-- checked anywhere in the app). It doesn't even include ai_summarization,
-- the one key that IS real.
--
-- This migration adds org_has_feature() — mirrors has_permission(org,
-- perm)'s exact shape (0002) — and replaces plans.features with an
-- accurate, small vocabulary of things that actually exist in the app:
-- messaging, whatsapp_reminders, hr_module, ai_summarization. Part B
-- (0101) wires these into real enforcement.
--
-- Deliberately NOT gated (stated here, not just omitted, so it's a
-- decision): role availability (Litigation Clerk, HR roles, etc. — an
-- org-structure choice, not a premium feature), Reports depth (no actual
-- basic/advanced split exists in the built Reports page despite
-- highlights implying one), storage limits (no usage-tracking exists to
-- enforce against yet).
-- ============================================================================

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (p.features ->> p_feature)::boolean
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.organization_id = p_org
  ), false);
$$;

-- Full replace, not merge — the old keys are dead weight nothing reads.
update public.plans set
  features = '{"messaging": false, "whatsapp_reminders": false, "hr_module": false, "ai_summarization": false}'::jsonb
where key = 'starter';

update public.plans set
  features = '{"messaging": true, "whatsapp_reminders": true, "hr_module": false, "ai_summarization": false}'::jsonb
where key = 'professional';

update public.plans set
  features = '{"messaging": true, "whatsapp_reminders": true, "hr_module": true, "ai_summarization": true}'::jsonb
where key in ('business', 'enterprise');

-- Marketing copy catches up to what's now actually enforced (and to
-- modules built after 0053 originally wrote these: HR, Messaging).
update public.plans set
  highlights = array[
    'Up to 3 users', 'Core matter management', 'Client management', 'Contacts', 'Documents',
    'Hearings & Calendar', 'Tasks', 'Email notifications', 'Time tracking', 'Expenses',
    'Basic billing & invoicing', 'Basic reports'
  ]
where key = 'starter';

update public.plans set
  highlights = array[
    'Up to 10 users', 'Everything in Starter', 'Team messaging (channels + DMs)',
    'Email + WhatsApp reminders', 'Advanced billing', 'Advanced reports',
    'Increased document storage', 'Priority support'
  ]
where key = 'professional';

update public.plans set
  highlights = array[
    'Up to 25 users', 'Everything in Professional', 'HR & People Management',
    'AI-powered matter summaries', 'More storage', 'Advanced firm controls', 'Priority support'
  ]
where key = 'business';

update public.plans set
  highlights = array[
    'Custom number of users', 'Everything in Business', 'Custom storage',
    'Custom integrations', 'Custom support requirements'
  ]
where key = 'enterprise';
