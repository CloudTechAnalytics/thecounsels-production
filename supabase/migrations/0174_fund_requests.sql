-- ============================================================================
-- Migration 0174 — Fund Requests: requisition → approval chain → disbursement
-- → retirement with receipts.
--
-- Built for firms that advance cash to staff (filing fees, travel, court
-- logistics, office spend) and need every naira approved, paid out, and then
-- "retired" against receipts.
--
-- Lifecycle (status):
--   pending → approved → disbursed → retirement_submitted → retired
--   pending → rejected            pending/approved → cancelled
--   retirement_submitted → disbursed  (retirement queried by finance)
--
-- Approval chain is built per request at submission, in fund_request_approvals:
--   1. line_manager — the requester's manager (staff_profiles.manager_id),
--      when the firm requires it and the requester has one.
--   2. approver     — anyone holding funds.approve (finance / partners).
--   3. leadership   — a Managing Partner or Partner, only when the amount is
--      at or above the firm's leadership_threshold.
-- Every transition is an RPC (same posture as leave), so each one writes an
-- audit row and notifies whoever acts next. No raw UPDATE policy exists on
-- fund_requests.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('funds.request', 'funds', 'request', 'Request funds and retire your own expenses'),
  ('funds.approve', 'funds', 'approve', 'Approve or reject staff fund requests'),
  ('funds.manage',  'funds', 'manage',  'Disburse funds, review retirements, view fund reports and settings')
on conflict (key) do nothing;

-- Every firm role can request funds for itself.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'funds.request'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'funds.approve'
where r.key in ('managing_partner', 'partner', 'finance')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'funds.manage'
where r.key in ('managing_partner', 'finance')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Does ANOTHER member hold a permission? has_permission() only ever checks
-- the caller; fan-outs and approver checks need this. Internal only.
-- ---------------------------------------------------------------------------
create or replace function public.member_has_permission(p_org uuid, p_user uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_org and m.user_id = p_user
      and m.status = 'active' and p.key = p_perm
  );
$$;
revoke execute on function public.member_has_permission(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.member_role_key(p_org uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.key::text
  from public.memberships m join public.roles r on r.id = m.role_id
  where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'
  limit 1;
$$;
revoke execute on function public.member_role_key(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settings (one row per firm; absent row = defaults)
-- ---------------------------------------------------------------------------
create table public.fund_settings (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,
  require_line_manager  boolean not null default true,
  leadership_threshold  numeric(14,2) check (leadership_threshold is null or leadership_threshold > 0),
  retirement_due_days   integer not null default 14 check (retirement_due_days between 1 and 365),
  updated_by            uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now()
);
alter table public.fund_settings enable row level security;
create policy "fund_settings_select" on public.fund_settings
  for select using (public.has_permission(organization_id, 'funds.request') or public.has_permission(organization_id, 'funds.manage'));
create policy "fund_settings_insert" on public.fund_settings
  for insert with check (public.has_permission(organization_id, 'funds.manage'));
create policy "fund_settings_update" on public.fund_settings
  for update using (public.has_permission(organization_id, 'funds.manage'))
  with check (public.has_permission(organization_id, 'funds.manage'));

create table public.fund_request_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year            integer not null,
  last_value      integer not null default 0,
  primary key (organization_id, year)
);
alter table public.fund_request_counters enable row level security;
-- No policies: only submit_fund_request() touches it.

-- ---------------------------------------------------------------------------
-- Requests, approval steps, retirement lines
-- ---------------------------------------------------------------------------
create table public.fund_requests (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  request_number           text not null,
  title                    text not null,
  category                 text not null check (category in (
                              'court_filing', 'travel', 'transport', 'client_expense',
                              'office_supplies', 'utilities', 'training', 'staff_welfare', 'other'
                            )),
  purpose                  text,
  amount                   numeric(14,2) not null check (amount > 0),
  needed_by                date,
  matter_id                uuid references public.matters(id) on delete set null,
  status                   text not null default 'pending' check (status in (
                              'pending', 'approved', 'rejected', 'cancelled',
                              'disbursed', 'retirement_submitted', 'retired'
                            )),
  current_step             integer not null default 1,
  disbursed_amount         numeric(14,2),
  disbursed_at             timestamptz,
  disbursed_by             uuid references public.profiles(id) on delete set null,
  disbursement_method      text,
  disbursement_reference   text,
  spent_amount             numeric(14,2),
  retirement_note          text,
  retirement_submitted_at  timestamptz,
  retirement_reviewed_by   uuid references public.profiles(id) on delete set null,
  retirement_reviewed_at   timestamptz,
  retirement_comment       text,
  retired_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, request_number)
);
create index idx_fund_requests_org_status on public.fund_requests (organization_id, status, created_at desc);
create index idx_fund_requests_org_user on public.fund_requests (organization_id, user_id, created_at desc);

create table public.fund_request_approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null references public.fund_requests(id) on delete cascade,
  step            integer not null,
  stage           text not null check (stage in ('line_manager', 'approver', 'leadership')),
  approver_id     uuid references public.profiles(id) on delete set null,
  status          text not null default 'waiting' check (status in ('waiting', 'pending', 'approved', 'rejected', 'skipped')),
  acted_by        uuid references public.profiles(id) on delete set null,
  acted_at        timestamptz,
  comment         text,
  unique (request_id, step)
);
create index idx_fund_request_approvals_approver on public.fund_request_approvals (approver_id, status);

create table public.fund_retirement_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null references public.fund_requests(id) on delete cascade,
  description     text not null,
  amount          numeric(14,2) not null check (amount >= 0),
  spent_on        date,
  receipt_path    text,
  receipt_name    text,
  receipt_mime    text,
  receipt_size    bigint,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index idx_fund_retirement_items_request on public.fund_retirement_items (request_id);

-- Visibility: the requester, anyone who approves or manages funds, and
-- anyone named on the request's approval chain (a line manager without
-- funds.approve still needs to see what they're signing off).
create or replace function public.can_view_fund_request(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request
      and (
        fr.user_id = auth.uid()
        or public.has_permission(fr.organization_id, 'funds.approve')
        or public.has_permission(fr.organization_id, 'funds.manage')
        or exists (select 1 from public.fund_request_approvals a where a.request_id = fr.id and a.approver_id = auth.uid())
        or (public.member_role_key(fr.organization_id, auth.uid()) in ('managing_partner', 'partner'))
      )
  );
$$;

-- Retirement lines (and their receipts) are editable only by the requester,
-- only while the money is out and the retirement hasn't been submitted.
create or replace function public.can_edit_fund_retirement(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id = auth.uid() and fr.status = 'disbursed'
  );
$$;
grant execute on function public.can_view_fund_request(uuid) to authenticated;
grant execute on function public.can_edit_fund_retirement(uuid) to authenticated;

alter table public.fund_requests enable row level security;
create policy "fund_requests_select" on public.fund_requests
  for select using (public.can_view_fund_request(id));
-- No insert/update/delete policy — RPCs below only.

alter table public.fund_request_approvals enable row level security;
create policy "fund_request_approvals_select" on public.fund_request_approvals
  for select using (public.can_view_fund_request(request_id));

alter table public.fund_retirement_items enable row level security;
create policy "fund_retirement_items_select" on public.fund_retirement_items
  for select using (public.can_view_fund_request(request_id));
create policy "fund_retirement_items_insert" on public.fund_retirement_items
  for insert with check (created_by = auth.uid() and public.can_edit_fund_retirement(request_id));
create policy "fund_retirement_items_delete" on public.fund_retirement_items
  for delete using (public.can_edit_fund_retirement(request_id));

-- Receipts: private bucket, path {organization_id}/{request_id}/{uuid}-{file}
insert into storage.buckets (id, name, public)
values ('fund-receipts', 'fund-receipts', false)
on conflict (id) do nothing;

create policy "fund_receipts_select" on storage.objects
  for select using (bucket_id = 'fund-receipts' and public.can_view_fund_request(((storage.foldername(name))[2])::uuid));
create policy "fund_receipts_insert" on storage.objects
  for insert with check (bucket_id = 'fund-receipts' and public.can_edit_fund_retirement(((storage.foldername(name))[2])::uuid));
create policy "fund_receipts_delete" on storage.objects
  for delete using (bucket_id = 'fund-receipts' and public.can_edit_fund_retirement(((storage.foldername(name))[2])::uuid));

-- ---------------------------------------------------------------------------
-- Internal: notify whoever can act on the request's current step.
-- ---------------------------------------------------------------------------
create or replace function public.notify_fund_step(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.fund_requests;
  st public.fund_request_approvals;
  v_title text;
begin
  select * into fr from public.fund_requests where id = p_request;
  select * into st from public.fund_request_approvals where request_id = p_request and status = 'pending';
  if st.id is null then return; end if;
  v_title := 'Fund request ' || fr.request_number || ' needs your approval';

  if st.stage = 'line_manager' then
    perform public.notify_user(fr.organization_id, st.approver_id, auth.uid(), 'hr', 'funds.approval_needed',
      'fund_request', fr.id, v_title, 'info');
  elsif st.stage = 'approver' then
    perform public.notify_user(fr.organization_id, m.user_id, auth.uid(), 'hr', 'funds.approval_needed',
      'fund_request', fr.id, v_title, 'info')
    from public.memberships m
    where m.organization_id = fr.organization_id and m.status = 'active'
      and m.user_id <> fr.user_id
      and public.member_has_permission(fr.organization_id, m.user_id, 'funds.approve');
  else
    perform public.notify_user(fr.organization_id, m.user_id, auth.uid(), 'hr', 'funds.approval_needed',
      'fund_request', fr.id, v_title, 'info')
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = fr.organization_id and m.status = 'active'
      and m.user_id <> fr.user_id
      and r.key in ('managing_partner', 'partner');
  end if;
end;
$$;
revoke execute on function public.notify_fund_step(uuid) from public, anon, authenticated;

create or replace function public.notify_fund_managers(p_request uuid, p_action text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.fund_requests;
begin
  select * into fr from public.fund_requests where id = p_request;
  perform public.notify_user(fr.organization_id, m.user_id, auth.uid(), 'hr', p_action,
    'fund_request', fr.id, p_title, 'info')
  from public.memberships m
  where m.organization_id = fr.organization_id and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.member_has_permission(fr.organization_id, m.user_id, 'funds.manage');
end;
$$;
revoke execute on function public.notify_fund_managers(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.submit_fund_request(
  p_org uuid,
  p_title text,
  p_category text,
  p_amount numeric,
  p_needed_by date default null,
  p_matter uuid default null,
  p_purpose text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_settings public.fund_settings;
  v_require_manager boolean;
  v_manager uuid;
  v_seq integer;
  v_year integer := extract(year from now())::int;
  v_step integer := 0;
begin
  if not public.has_permission(p_org, 'funds.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'Fund requests are part of HR & People Management, which is not included in your plan. Upgrade to Business to use it.';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Give the request a title';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_matter is not null and not exists (select 1 from public.matters where id = p_matter and organization_id = p_org) then
    raise exception 'Matter not found';
  end if;

  select * into v_settings from public.fund_settings where organization_id = p_org;
  v_require_manager := coalesce(v_settings.require_line_manager, true);

  insert into public.fund_request_counters (organization_id, year, last_value)
  values (p_org, v_year, 1)
  on conflict (organization_id, year) do update set last_value = public.fund_request_counters.last_value + 1
  returning last_value into v_seq;

  insert into public.fund_requests (organization_id, user_id, request_number, title, category, purpose, amount, needed_by, matter_id)
  values (p_org, auth.uid(), 'FR-' || v_year || '-' || lpad(v_seq::text, 4, '0'), trim(p_title), p_category,
          nullif(trim(coalesce(p_purpose, '')), ''), round(p_amount, 2), p_needed_by, p_matter)
  returning * into rec;

  if v_require_manager then
    select sp.manager_id into v_manager
    from public.staff_profiles sp
    join public.memberships m on m.organization_id = sp.organization_id and m.user_id = sp.manager_id and m.status = 'active'
    where sp.organization_id = p_org and sp.user_id = auth.uid() and sp.manager_id <> auth.uid();
    if v_manager is not null then
      v_step := v_step + 1;
      insert into public.fund_request_approvals (organization_id, request_id, step, stage, approver_id)
      values (p_org, rec.id, v_step, 'line_manager', v_manager);
    end if;
  end if;

  v_step := v_step + 1;
  insert into public.fund_request_approvals (organization_id, request_id, step, stage)
  values (p_org, rec.id, v_step, 'approver');

  if v_settings.leadership_threshold is not null and rec.amount >= v_settings.leadership_threshold then
    v_step := v_step + 1;
    insert into public.fund_request_approvals (organization_id, request_id, step, stage)
    values (p_org, rec.id, v_step, 'leadership');
  end if;

  update public.fund_request_approvals set status = 'pending' where request_id = rec.id and step = 1;

  perform public.log_audit(p_org, 'funds.requested', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' submitted',
    jsonb_build_object('amount', rec.amount, 'category', rec.category, 'steps', v_step));
  perform public.notify_fund_step(rec.id);

  return rec;
end;
$$;

create or replace function public.act_on_fund_request(
  p_request uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  st public.fund_request_approvals;
  v_role text;
  v_allowed boolean := false;
  v_next integer;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request is no longer awaiting approval';
  end if;
  select * into st from public.fund_request_approvals where request_id = rec.id and status = 'pending' for update;
  if st.id is null then
    raise exception 'This request has no open approval step';
  end if;

  v_role := public.member_role_key(rec.organization_id, auth.uid());
  if st.stage = 'line_manager' then
    v_allowed := st.approver_id = auth.uid();
  elsif st.stage = 'approver' then
    v_allowed := public.has_permission(rec.organization_id, 'funds.approve')
      and (rec.user_id <> auth.uid() or v_role = 'managing_partner');
  else
    v_allowed := v_role in ('managing_partner', 'partner')
      and (rec.user_id <> auth.uid() or v_role = 'managing_partner');
  end if;
  if not v_allowed then
    raise exception 'You are not the approver for this step' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then
    raise exception 'Give a reason when rejecting a request';
  end if;

  update public.fund_request_approvals
  set status = case when p_approve then 'approved' else 'rejected' end,
      acted_by = auth.uid(), acted_at = now(), comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = st.id;

  if not p_approve then
    update public.fund_request_approvals set status = 'skipped' where request_id = rec.id and status = 'waiting';
    update public.fund_requests set status = 'rejected', updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.rejected', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' rejected', jsonb_build_object('comment', p_comment, 'stage', st.stage));
    perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.rejected',
      'fund_request', rec.id, 'Your fund request ' || rec.request_number || ' was rejected', 'info');
    return rec;
  end if;

  select min(step) into v_next from public.fund_request_approvals where request_id = rec.id and status = 'waiting';
  if v_next is not null then
    update public.fund_request_approvals set status = 'pending' where request_id = rec.id and step = v_next;
    update public.fund_requests set current_step = v_next, updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.step_approved', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' approved at ' || st.stage || ' stage', jsonb_build_object('stage', st.stage));
    perform public.notify_fund_step(rec.id);
  else
    update public.fund_requests set status = 'approved', updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.approved', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' approved', jsonb_build_object('amount', rec.amount));
    perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.approved',
      'fund_request', rec.id, 'Your fund request ' || rec.request_number || ' was approved', 'info');
    perform public.notify_fund_managers(rec.id, 'funds.ready_to_disburse',
      'Fund request ' || rec.request_number || ' is approved and ready to disburse');
  end if;

  return rec;
end;
$$;

create or replace function public.cancel_fund_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  update public.fund_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request and user_id = auth.uid() and status in ('pending', 'approved')
  returning * into rec;
  if rec.id is null then
    raise exception 'Nothing to cancel — this request isn''t yours, or the money has already been paid out';
  end if;
  update public.fund_request_approvals set status = 'skipped' where request_id = rec.id and status in ('pending', 'waiting');
  perform public.log_audit(rec.organization_id, 'funds.cancelled', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' cancelled');
end;
$$;

create or replace function public.disburse_fund_request(
  p_request uuid,
  p_amount numeric,
  p_method text default null,
  p_reference text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_days integer;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'approved' then
    raise exception 'Only approved requests can be disbursed';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Disbursed amount must be greater than zero';
  end if;

  update public.fund_requests
  set status = 'disbursed', disbursed_amount = round(p_amount, 2), disbursed_at = now(), disbursed_by = auth.uid(),
      disbursement_method = nullif(trim(coalesce(p_method, '')), ''),
      disbursement_reference = nullif(trim(coalesce(p_reference, '')), ''),
      updated_at = now()
  where id = rec.id
  returning * into rec;

  select coalesce(retirement_due_days, 14) into v_days from public.fund_settings where organization_id = rec.organization_id;
  perform public.log_audit(rec.organization_id, 'funds.disbursed', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' disbursed',
    jsonb_build_object('amount', rec.disbursed_amount, 'method', rec.disbursement_method, 'reference', rec.disbursement_reference));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.disbursed',
    'fund_request', rec.id,
    'Funds for ' || rec.request_number || ' have been paid out — retire them with receipts within ' || coalesce(v_days, 14) || ' days',
    'info');
  return rec;
end;
$$;

create or replace function public.submit_fund_retirement(p_request uuid, p_note text default null)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_spent numeric(14,2);
  v_count integer;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status <> 'disbursed' then
    raise exception 'Only paid-out requests can be retired';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_count, v_spent from public.fund_retirement_items where request_id = rec.id;
  if v_count = 0 then
    raise exception 'Add at least one expense line before submitting the retirement';
  end if;

  update public.fund_requests
  set status = 'retirement_submitted', spent_amount = v_spent,
      retirement_note = nullif(trim(coalesce(p_note, '')), ''), retirement_submitted_at = now(), updated_at = now()
  where id = rec.id
  returning * into rec;

  perform public.log_audit(rec.organization_id, 'funds.retirement_submitted', 'fund_request', rec.id,
    'Retirement submitted for ' || rec.request_number,
    jsonb_build_object('spent', v_spent, 'disbursed', rec.disbursed_amount, 'lines', v_count));
  perform public.notify_fund_managers(rec.id, 'funds.retirement_submitted',
    'Retirement for ' || rec.request_number || ' is ready for review');
  return rec;
end;
$$;

create or replace function public.review_fund_retirement(
  p_request uuid,
  p_accept boolean,
  p_comment text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'retirement_submitted' then
    raise exception 'There is no submitted retirement to review';
  end if;
  if rec.user_id = auth.uid() and public.member_role_key(rec.organization_id, auth.uid()) <> 'managing_partner' then
    raise exception 'You cannot review your own retirement';
  end if;
  if not p_accept and coalesce(trim(p_comment), '') = '' then
    raise exception 'Say what needs fixing when querying a retirement';
  end if;

  update public.fund_requests
  set status = case when p_accept then 'retired' else 'disbursed' end,
      retired_at = case when p_accept then now() else null end,
      retirement_reviewed_by = auth.uid(), retirement_reviewed_at = now(),
      retirement_comment = nullif(trim(coalesce(p_comment, '')), ''),
      updated_at = now()
  where id = rec.id
  returning * into rec;

  perform public.log_audit(rec.organization_id,
    case when p_accept then 'funds.retired' else 'funds.retirement_queried' end, 'fund_request', rec.id,
    case when p_accept then 'Retirement accepted for ' else 'Retirement queried for ' end || rec.request_number,
    jsonb_build_object('comment', p_comment, 'spent', rec.spent_amount, 'disbursed', rec.disbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_accept then 'funds.retired' else 'funds.retirement_queried' end,
    'fund_request', rec.id,
    case when p_accept then 'Your retirement for ' || rec.request_number || ' was accepted'
         else 'Your retirement for ' || rec.request_number || ' was queried — please review and resubmit' end,
    'info');
  return rec;
end;
$$;

grant execute on function public.submit_fund_request(uuid, text, text, numeric, date, uuid, text) to authenticated;
grant execute on function public.act_on_fund_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_fund_request(uuid) to authenticated;
grant execute on function public.disburse_fund_request(uuid, numeric, text, text) to authenticated;
grant execute on function public.submit_fund_retirement(uuid, text) to authenticated;
grant execute on function public.review_fund_retirement(uuid, boolean, text) to authenticated;
