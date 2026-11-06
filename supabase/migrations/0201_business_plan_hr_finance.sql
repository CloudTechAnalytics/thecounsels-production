-- ============================================================================
-- Migration 0201 — Circulars, fund requests (with expense retirement and the
-- Approval Centre) and payroll (with payslips) move to the Business plan.
--
-- Three new plan features, on for Business / Enterprise, off for Starter /
-- Professional. Professional keeps basic HR under 'hr_module': employees,
-- reporting lines, leave, onboarding, HR documents and HR requests.
--
-- Same boundary as 0101/0200: gate STARTING new activity (sending a
-- circular, raising a new fund request, setting up fund workflows, running
-- payroll, setting salaries and payroll settings) — not finishing what is
-- already in the system (an advance already paid out can still be retired,
-- a returned request resubmitted, a pending approval decided).
-- ============================================================================

update public.plans set features = coalesce(features, '{}'::jsonb)
  || '{"circulars": true, "fund_requests": true, "payroll": true}'::jsonb
where key in ('business', 'enterprise');

update public.plans set features = coalesce(features, '{}'::jsonb)
  || '{"circulars": false, "fund_requests": false, "payroll": false}'::jsonb
where key in ('starter', 'professional');

update public.plans
set highlights = array_append(highlights, 'Fund requests, expense retirement & payroll')
where key = 'business' and not ('Fund requests, expense retirement & payroll' = any (highlights));
update public.plans
set highlights = array_append(highlights, 'Circulars with read & acknowledgement tracking')
where key = 'business' and not ('Circulars with read & acknowledgement tracking' = any (highlights));

-- Payroll: settings, salaries and runs.
drop policy if exists payroll_settings_insert on public.payroll_settings;
create policy payroll_settings_insert on public.payroll_settings
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.org_has_feature(organization_id, 'payroll'));

drop policy if exists employee_salaries_insert on public.employee_salaries;
create policy employee_salaries_insert on public.employee_salaries
  for insert with check (public.org_has_feature(organization_id, 'payroll') and public.can_edit_salary(organization_id, employee_id));

drop policy if exists payroll_runs_insert on public.payroll_runs;
create policy payroll_runs_insert on public.payroll_runs
  for insert with check (status = 'draft' and public.has_permission(organization_id, 'payroll.manage')
    and public.user_is_firm_wide(organization_id) and public.org_has_feature(organization_id, 'payroll'));

-- Fund request approval workflows.
drop policy if exists approval_workflows_write on public.approval_workflows;
create policy approval_workflows_write on public.approval_workflows
  for all using (public.has_permission(organization_id, 'funds.manage'))
  with check (public.has_permission(organization_id, 'funds.manage') and public.org_has_feature(organization_id, 'fund_requests'));

-- ---------------------------------------------------------------------------
-- Entry-point functions (bodies otherwise unchanged).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_fund_request(p_org uuid, p_title text, p_category text, p_amount numeric, p_request uuid DEFAULT NULL::uuid, p_needed_by date DEFAULT NULL::date, p_matter uuid DEFAULT NULL::uuid, p_client uuid DEFAULT NULL::uuid, p_purpose text DEFAULT NULL::text, p_submit boolean DEFAULT true)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- New requests need the Business plan; drafts and returned requests already
  -- in the system can still be finished (0201).
  if not public.org_has_feature(p_org, 'hr_module') or (p_request is null and not public.org_has_feature(p_org, 'fund_requests')) then
    raise exception 'Fund requests are available on the Business plan — upgrade to use them' using errcode = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.send_hr_announcement(p_org uuid, p_title text, p_body text, p_audience_type text, p_department_id uuid DEFAULT NULL::uuid, p_user_ids uuid[] DEFAULT NULL::uuid[], p_branch text DEFAULT NULL::text, p_role_key role_key DEFAULT NULL::role_key)
 RETURNS hr_announcements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.hr_announcements;
  recipient record;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'circulars') then
    raise exception 'Circulars are available on the Business plan — upgrade to use them' using errcode = '42501';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, audience_role_key, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, p_role_key, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    left join public.roles r on r.id = m.role_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
        or (p_audience_type = 'role' and r.key = p_role_key)
      )
  loop
    perform public.notify_user(p_org, recipient.user_id, auth.uid(), 'hr', 'hr.announcement',
      'hr_announcement', rec.id, p_title, 'info');
  end loop;

  perform public.log_audit(p_org, 'hr.announcement_sent', 'hr_announcement', rec.id,
    format('Announcement sent: %s', p_title), jsonb_build_object('audience_type', p_audience_type));

  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_circular(p_org uuid, p_title text, p_body text, p_audience_type text, p_department_id uuid DEFAULT NULL::uuid, p_user_ids uuid[] DEFAULT NULL::uuid[], p_branch_id uuid DEFAULT NULL::uuid, p_role_key role_key DEFAULT NULL::role_key, p_requires_ack boolean DEFAULT false, p_ack_due date DEFAULT NULL::date, p_pinned boolean DEFAULT false, p_category text DEFAULT NULL::text, p_attachment_path text DEFAULT NULL::text, p_attachment_name text DEFAULT NULL::text)
 RETURNS hr_announcements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.hr_announcements;
  v_n integer;
begin
  if not public.org_has_feature(p_org, 'circulars') then
    raise exception 'Circulars are available on the Business plan — upgrade to use them' using errcode = '42501';
  end if;
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Add a title and the message';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience: %', p_audience_type;
  end if;
  if p_attachment_path is not null and split_part(p_attachment_path, '/', 1) <> p_org::text then
    raise exception 'Attachment does not belong to this firm';
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids,
    audience_branch_id, audience_role_key, requires_ack, ack_due, pinned, category, attachment_path, attachment_name, created_by)
  values (p_org, trim(p_title), p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'),
    p_branch_id, p_role_key, coalesce(p_requires_ack, false), p_ack_due, coalesce(p_pinned, false), nullif(trim(coalesce(p_category, '')), ''),
    p_attachment_path, p_attachment_name, auth.uid())
  returning * into rec;

  insert into public.hr_announcement_recipients (announcement_id, organization_id, user_id)
  select rec.id, p_org, m.user_id
  from public.memberships m
  join public.roles ro on ro.id = m.role_id
  where m.organization_id = p_org and m.status = 'active' and m.user_id <> auth.uid()
    and (
      p_audience_type = 'organization'
      or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
      or (p_audience_type = 'role' and ro.key = p_role_key)
      or (p_audience_type = 'department' and (
            exists (select 1 from public.employees e where e.organization_id = p_org and e.user_id = m.user_id and e.department_id = p_department_id)
         or exists (select 1 from public.staff_profiles sp where sp.organization_id = p_org and sp.user_id = m.user_id and sp.department_id = p_department_id)))
      or (p_audience_type = 'branch' and (
            exists (select 1 from public.member_branches mb where mb.membership_id = m.id and mb.branch_id = p_branch_id)
         or exists (select 1 from public.employees e where e.organization_id = p_org and e.user_id = m.user_id and e.branch_id = p_branch_id)))
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nobody matches that audience — choose who should receive it';
  end if;
  update public.hr_announcements set recipient_count = v_n where id = rec.id returning * into rec;

  perform public.notify_user(p_org, r.user_id, auth.uid(), 'hr', 'hr.announcement', 'hr_announcement', rec.id,
    case when rec.requires_ack then 'Please read and acknowledge: ' else 'New circular: ' end || rec.title, 'info')
  from public.hr_announcement_recipients r where r.announcement_id = rec.id;

  perform public.log_audit(p_org, 'hr.circular_sent', 'hr_announcement', rec.id,
    format('Circular %s sent to %s people: %s', rec.reference_no, v_n, rec.title),
    jsonb_build_object('audience_type', p_audience_type, 'requires_ack', rec.requires_ack));
  return rec;
end;
$function$;
