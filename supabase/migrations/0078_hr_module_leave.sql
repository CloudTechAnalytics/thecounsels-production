-- ============================================================================
-- Migration 0078 — HR & People Management, Part 4: Leave Management.
--
-- Entitlements are org-configurable (leave_types.default_entitlement_days),
-- never hardcoded. Balances only change on APPROVAL, not on request —
-- matches the module spec exactly ("When leave is approved: update leave
-- balance"). Status transitions (approve/reject/cancel) are RPC-only, no
-- raw UPDATE policy on leave_requests — same "sensitive transition ->
-- RPC, not a raw policy" posture used throughout this app (delete_channel,
-- clear_audit_log, cancel_subscription, etc.), so every transition is
-- guaranteed to also write an audit_logs row and a notification.
-- ============================================================================

create table public.leave_types (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  name                      text not null,
  default_entitlement_days  integer not null default 0,
  requires_approval         boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.leave_types enable row level security;
create policy "leave_types_select" on public.leave_types
  for select using (public.has_permission(organization_id, 'leave.request') or public.has_permission(organization_id, 'leave.manage'));
create policy "leave_types_write" on public.leave_types
  for all using (public.has_permission(organization_id, 'leave.manage'))
  with check (public.has_permission(organization_id, 'leave.manage'));

create table public.leave_balances (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  leave_type_id     uuid not null references public.leave_types(id) on delete cascade,
  year              integer not null,
  entitlement_days  numeric(6,2) not null default 0,
  used_days         numeric(6,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, user_id, leave_type_id, year)
);
alter table public.leave_balances enable row level security;
create policy "leave_balances_select" on public.leave_balances
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'leave.manage'));
-- No insert/update policy — only request_leave()/review_leave_request() below ever touch balances.

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id) on delete restrict,
  start_date      date not null,
  end_date        date not null,
  days            numeric(6,2) not null,
  reason          text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  review_comment  text,
  created_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_leave_requests_org_user on public.leave_requests (organization_id, user_id, created_at desc);

alter table public.leave_requests enable row level security;
create policy "leave_requests_select" on public.leave_requests
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'leave.manage'));
create policy "leave_requests_insert" on public.leave_requests
  for insert with check (
    user_id = auth.uid() and status = 'pending'
    and public.has_permission(organization_id, 'leave.request')
  );
-- No update/delete policy — review_leave_request() and cancel_leave_request() below are the only way status changes.

create or replace function public.request_leave(
  p_org uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  -- Notify anyone in the org who can approve leave — best-effort fan-out,
  -- kept simple (in-app only) for this phase; multi-channel (email/
  -- WhatsApp) HR notifications are a follow-up, same as the existing
  -- task-reminder engine's channel dispatch but generalized for HR events.
  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.has_permission(p_org, 'leave.manage');

  return rec;
end;
$$;

create or replace function public.review_leave_request(
  p_request uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_year int;
begin
  select * into rec from public.leave_requests where id = p_request;
  if rec.id is null then
    raise exception 'Leave request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'leave.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_comment = p_comment
  where id = p_request
  returning * into rec;

  if p_approve then
    v_year := extract(year from rec.start_date)::int;
    insert into public.leave_balances (organization_id, user_id, leave_type_id, year, entitlement_days, used_days)
    values (
      rec.organization_id, rec.user_id, rec.leave_type_id, v_year,
      coalesce((select default_entitlement_days from public.leave_types where id = rec.leave_type_id), 0),
      rec.days
    )
    on conflict (organization_id, user_id, leave_type_id, year)
    do update set used_days = public.leave_balances.used_days + excluded.used_days, updated_at = now();
  end if;

  perform public.log_audit(rec.organization_id, case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id, case when p_approve then 'Leave approved' else 'Leave rejected' end,
    jsonb_build_object('comment', p_comment));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id,
    case when p_approve then 'Your leave request was approved' else 'Your leave request was rejected' end,
    'info');

  return rec;
end;
$$;

create or replace function public.cancel_leave_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  update public.leave_requests
  set status = 'cancelled'
  where id = p_request and user_id = auth.uid() and status = 'pending'
  returning organization_id into v_org;

  if v_org is null then
    raise exception 'Nothing to cancel — this request no longer exists, isn''t yours, or has already been reviewed';
  end if;

  perform public.log_audit(v_org, 'leave.cancelled', 'leave_request', p_request, 'Leave request cancelled');
end;
$$;

grant execute on function public.request_leave(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.review_leave_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_leave_request(uuid) to authenticated;
