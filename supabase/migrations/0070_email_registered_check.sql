-- ============================================================================
-- Migration 0069 — Pre-flight "is this email already registered" check.
--
-- Supabase's own signUp() deliberately does not reveal whether an email is
-- already registered when that account is already confirmed (a standard
-- anti-account-enumeration protection) — it can silently behave as if
-- signup succeeded, leaving someone typing their own already-registered
-- email stuck waiting for a verification email that was never actually
-- (re-)sent. This narrow, minimal RPC lets the registration form check
-- first and say so immediately, instead of waiting on a signUp() round
-- trip that may never clearly report the real reason.
--
-- Deliberately returns ONLY a boolean — nothing else about the account
-- (name, id, org) is exposed. This is a conscious, small trade-off of
-- "email exists" being checkable pre-signup in exchange for materially
-- better UX on the registration form.
-- ============================================================================

create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where email = lower(trim(p_email)));
$$;

grant execute on function public.email_is_registered(text) to anon, authenticated;
