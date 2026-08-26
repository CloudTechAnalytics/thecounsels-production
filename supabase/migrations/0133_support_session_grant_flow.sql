-- ============================================================================
-- Migration 0132 — Support sessions require the firm's own consent.
--
-- start_support_session() previously let any platform admin begin an
-- active, 30-minute session unilaterally — "Enter workspace" worked
-- immediately, no firm involvement. This adds a real request/grant step:
-- platform staff can only REQUEST access now; the firm's own admin (owner
-- or members.manage — explicitly NOT is_platform_admin(), see below) has
-- to grant it before the session actually goes active and expires_at
-- moves into the future.
--
-- IMPORTANT — this only widens what was already the actual gate. Almost
-- every table's RLS goes through has_permission(), which already has an
-- unconditional is_platform_admin() OR-bypass, independent of
-- support_sessions entirely. This migration does not touch that. What it
-- narrows is exactly what support_sessions already gated before tonight:
-- has_financial_access() (financial data) and audit_select's
-- non-platform-action visibility. See has_permission() lockdown as a
-- separate, much larger, deliberately-deferred piece of work if the firm
-- data itself should also require a grant.
--
-- grant_support_session/deny_support_session deliberately do NOT reuse
-- is_org_admin() — that function's own OR-chain includes
-- is_platform_admin() as a bypass, which would let a platform admin grant
-- or deny their own request. The firm-admin check here is written out
-- explicitly, omitting that branch on purpose.
-- ============================================================================

create type public.support_session_status as enum ('pending', 'active', 'denied', 'ended');

alter table public.support_sessions
  add column status public.support_session_status not null default 'pending',
  add column granted_by uuid references public.profiles(id) on delete set null,
  add column granted_at timestamptz,
  add column denied_at timestamptz;

-- Backfill: every row that existed before this migration was created under
-- the old auto-start model — treat as already active (or ended, if it was).
update public.support_sessions
  set status = case when ended_at is not null then 'ended'::public.support_session_status else 'active'::public.support_session_status end,
      granted_at = started_at;

drop function if exists public.start_support_session(uuid, text);

create or replace function public.request_support_session(p_org uuid, p_reason text)
returns public.support_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.support_sessions;
  recipient uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform staff can request a support session' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  insert into public.support_sessions (organization_id, admin_id, reason, status, expires_at)
  values (p_org, auth.uid(), p_reason, 'pending', now())
  returning * into s;

  perform public.log_audit(p_org, 'support.session_requested', 'support_session', s.id,
    'Support access requested', jsonb_build_object('reason', p_reason));

  for recipient in
    select m.user_id from public.memberships m
    where m.organization_id = p_org and m.status = 'active'
      and (m.is_owner = true or public.has_permission(p_org, 'members.manage'))
  loop
    perform public.notify_user(p_org, recipient, auth.uid(), 'support', 'support.session_requested',
      'support_session', s.id, 'CloudTech support has requested access to your workspace', 'urgent');
  end loop;

  return s;
end;
$$;

create or replace function public.grant_support_session(p_id uuid)
returns public.support_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.support_sessions;
  is_firm_admin boolean;
begin
  select * into s from public.support_sessions where id = p_id;
  if s.id is null then
    raise exception 'Support session not found';
  end if;
  if s.status <> 'pending' then
    raise exception 'This request is no longer pending';
  end if;

  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.organization_id = s.organization_id and m.status = 'active'
      and (m.is_owner = true or public.has_permission(s.organization_id, 'members.manage'))
  ) into is_firm_admin;
  if not is_firm_admin then
    raise exception 'Only this firm''s own admins can grant support access' using errcode = '42501';
  end if;

  update public.support_sessions
    set status = 'active', granted_by = auth.uid(), granted_at = now(),
        started_at = now(), expires_at = now() + interval '30 minutes'
    where id = p_id
    returning * into s;

  perform public.log_audit(s.organization_id, 'support.session_granted', 'support_session', s.id, 'Support access granted');
  perform public.notify_user(s.organization_id, s.admin_id, auth.uid(), 'support', 'support.session_granted',
    'support_session', s.id, 'Your support access request was granted', 'info');

  return s;
end;
$$;

create or replace function public.deny_support_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  admin uuid;
  is_firm_admin boolean;
begin
  select organization_id, admin_id into org, admin
    from public.support_sessions where id = p_id and status = 'pending';
  if org is null then
    raise exception 'Support session not found or no longer pending';
  end if;

  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.organization_id = org and m.status = 'active'
      and (m.is_owner = true or public.has_permission(org, 'members.manage'))
  ) into is_firm_admin;
  if not is_firm_admin then
    raise exception 'Only this firm''s own admins can deny support access' using errcode = '42501';
  end if;

  update public.support_sessions set status = 'denied', denied_at = now() where id = p_id;

  perform public.log_audit(org, 'support.session_denied', 'support_session', p_id, 'Support access denied');
  perform public.notify_user(org, admin, auth.uid(), 'support', 'support.session_denied',
    'support_session', p_id, 'Your support access request was denied', 'warning');
end;
$$;

-- Was platform-admin-only; now the firm's own admin can also end an active
-- session early — a safety valve, revoking access before the 30 minutes
-- run out, matching the spirit of "the firm is in control" this whole
-- migration is for.
create or replace function public.end_support_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  is_firm_admin boolean;
begin
  select organization_id into org from public.support_sessions where id = p_id and status = 'active';
  if org is null then
    return;
  end if;

  if not public.is_platform_admin() then
    select exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.organization_id = org and m.status = 'active'
        and (m.is_owner = true or public.has_permission(org, 'members.manage'))
    ) into is_firm_admin;
    if not is_firm_admin then
      raise exception 'Only platform staff or this firm''s own admins can end a support session' using errcode = '42501';
    end if;
  end if;

  update public.support_sessions set ended_at = now(), status = 'ended' where id = p_id;
  perform public.log_audit(org, 'support.session_ended', 'support_session', p_id, 'Support session ended');
end;
$$;

grant execute on function public.request_support_session(uuid, text) to authenticated;
grant execute on function public.grant_support_session(uuid) to authenticated;
grant execute on function public.deny_support_session(uuid) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;
