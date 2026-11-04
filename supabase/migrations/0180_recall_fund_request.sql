-- ============================================================================
-- Migration 0180 — Let requesters edit a request they've already sent, as
-- long as no approver has acted on it yet.
--
-- recall_fund_request() pulls a pending request back to draft (its open
-- approval steps are marked skipped, "recalled by requester"), the
-- requester edits it, and submitting again opens a new approval round —
-- the same path a request returned for clarification already takes. Once
-- any approver has decided, recall is refused: the requester can only
-- withdraw. Submitted requests are never deleted (they keep a reference
-- number and an audit trail); only never-sent drafts can be deleted.
-- ============================================================================

create or replace function public.recall_fund_request(p_request uuid)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status <> 'pending' then
    raise exception 'Only a request still waiting for approval can be recalled for editing';
  end if;
  if exists (
    select 1 from public.fund_request_approvals
    where request_id = rec.id and round = rec.current_round and status in ('approved', 'rejected', 'returned')
  ) then
    raise exception 'An approver has already acted on this request, so it can no longer be edited — withdraw it instead';
  end if;

  update public.fund_request_approvals set status = 'skipped', comment = 'Recalled by requester for editing'
  where request_id = rec.id and round = rec.current_round and status in ('pending', 'waiting');
  update public.fund_requests set status = 'draft', updated_at = now() where id = rec.id returning * into rec;

  perform public.log_audit(rec.organization_id, 'funds.recalled', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' recalled by the requester for editing');
  return rec;
end;
$$;
grant execute on function public.recall_fund_request(uuid) to authenticated;

create or replace function public.save_fund_request(
  p_org uuid,
  p_title text,
  p_category text,
  p_amount numeric,
  p_request uuid default null,
  p_needed_by date default null,
  p_matter uuid default null,
  p_client uuid default null,
  p_purpose text default null,
  p_submit boolean default true
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  emp public.employees;
  v_seq integer;
  v_year integer := extract(year from now())::int;
  v_resubmit boolean := false;
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
  if coalesce(trim(p_category), '') = '' then
    raise exception 'Choose a category';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_matter is not null and not exists (select 1 from public.matters where id = p_matter and organization_id = p_org) then
    raise exception 'Matter not found';
  end if;
  if p_client is not null and not exists (select 1 from public.clients where id = p_client and organization_id = p_org) then
    raise exception 'Client not found';
  end if;

  select * into emp from public.employees where organization_id = p_org and user_id = auth.uid();

  if p_request is null then
    insert into public.fund_requests (organization_id, user_id, employee_id, department_id, branch_id, title, category, purpose, amount, needed_by, matter_id, client_id, status)
    values (p_org, auth.uid(), emp.id, emp.department_id, emp.branch_id, trim(p_title), p_category,
            nullif(trim(coalesce(p_purpose, '')), ''), round(p_amount, 2), p_needed_by, p_matter, p_client, 'draft')
    returning * into rec;
  else
    select * into rec from public.fund_requests where id = p_request and organization_id = p_org for update;
    if rec.id is null or rec.user_id <> auth.uid() then
      raise exception 'Fund request not found';
    end if;
    if rec.status not in ('draft', 'returned') then
      raise exception 'Only drafts and requests returned for clarification can be edited';
    end if;
    -- A returned request, or one the requester recalled before any decision,
    -- goes back out as a fresh approval round; the earlier round stays on record.
    v_resubmit := rec.status = 'returned' or rec.request_number is not null;
    update public.fund_requests set
      title = trim(p_title), category = p_category, purpose = nullif(trim(coalesce(p_purpose, '')), ''),
      amount = round(p_amount, 2), needed_by = p_needed_by, matter_id = p_matter, client_id = p_client,
      employee_id = coalesce(employee_id, emp.id), department_id = coalesce(emp.department_id, department_id),
      branch_id = coalesce(emp.branch_id, branch_id), updated_at = now()
    where id = rec.id returning * into rec;
  end if;

  if not p_submit then
    return rec;
  end if;

  if rec.request_number is null then
    insert into public.fund_request_counters (organization_id, year, last_value)
    values (p_org, v_year, 1)
    on conflict (organization_id, year) do update set last_value = public.fund_request_counters.last_value + 1
    returning last_value into v_seq;
    update public.fund_requests set request_number = 'FR-' || v_year || '-' || lpad(v_seq::text, 4, '0') where id = rec.id;
  end if;

  update public.fund_requests set
    status = 'pending', submitted_at = now(), approved_amount = null,
    current_round = case when v_resubmit then current_round + 1 else current_round end,
    updated_at = now()
  where id = rec.id returning * into rec;

  perform public.build_fund_chain(rec.id);
  select * into rec from public.fund_requests where id = rec.id;

  perform public.log_audit(p_org, case when v_resubmit then 'funds.resubmitted' else 'funds.requested' end, 'fund_request', rec.id,
    'Fund request ' || rec.request_number || case when v_resubmit then ' resubmitted' else ' submitted' end,
    jsonb_build_object('amount', rec.amount, 'category', rec.category, 'workflow_id', rec.workflow_id, 'round', rec.current_round));
  perform public.notify_fund_step(rec.id);
  return rec;
end;
$$;

