-- ============================================================================
-- Migration 0206 — Appraisals: late joiners, reviewer changes, filing.
--
-- • add_to_appraisal_cycle(): HR adds staff to an open cycle (people who
--   joined, or got a login, after it was launched). appraisal_cycle_missing()
--   lists who in the cycle's audience isn't in it yet, and why.
-- • reassign_appraisal_reviewer(): HR changes who reviews an appraisal
--   (line manager changed, or is away) while it hasn't been reviewed yet.
-- • appraisals.filed_document_id: the signed PDF saved to the staff
--   member's HR documents ('performance_review'); mark_appraisal_filed()
--   records it. get_appraisal() now returns it.
-- ============================================================================

alter table public.appraisals add column if not exists filed_document_id uuid references public.hr_employee_documents(id) on delete set null;
grant select (filed_document_id) on public.appraisals to authenticated;

-- Who in the cycle's audience isn't in it yet.
create or replace function public.appraisal_cycle_missing(p_cycle uuid)
returns table (employee_id uuid, full_name text, can_add boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare c public.appraisal_cycles;
begin
  select * into c from public.appraisal_cycles where id = p_cycle;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  return query
  select e.id, trim(e.first_name || ' ' || coalesce(e.last_name, '')),
    (e.user_id is not null and exists (select 1 from public.memberships m where m.organization_id = e.organization_id and m.user_id = e.user_id and m.status = 'active')),
    case when e.user_id is null then 'No login yet — invite them first'
         when not exists (select 1 from public.memberships m where m.organization_id = e.organization_id and m.user_id = e.user_id and m.status = 'active') then 'Their access is not active'
         else null end
  from public.employees e
  where e.organization_id = c.organization_id
    and e.employment_status in ('active', 'on_leave', 'onboarding')
    and (c.audience_type = 'organization'
         or (c.audience_type = 'branch' and e.branch_id = c.audience_branch_id)
         or (c.audience_type = 'department' and e.department_id = c.audience_department_id))
    and not exists (select 1 from public.appraisals a where a.cycle_id = c.id and a.employee_id = e.id)
    and public.user_has_branch_access(c.organization_id, e.branch_id)
  order by 2;
end;
$$;
grant execute on function public.appraisal_cycle_missing(uuid) to authenticated;

create or replace function public.add_to_appraisal_cycle(p_cycle uuid, p_employee_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c public.appraisal_cycles; v_n integer;
begin
  select * into c from public.appraisal_cycles where id = p_cycle;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if c.status <> 'open' then raise exception 'People can only be added to an open cycle'; end if;
  if not public.org_has_feature(c.organization_id, 'appraisals') then
    raise exception 'Appraisals are available on the Business plan — upgrade to use them' using errcode = '42501';
  end if;

  insert into public.appraisals (organization_id, cycle_id, employee_id, user_id, branch_id, manager_user_id)
  select c.organization_id, c.id, e.id, e.user_id, e.branch_id, public.line_manager_user(c.organization_id, e.user_id)
  from public.employees e
  join public.memberships m on m.organization_id = e.organization_id and m.user_id = e.user_id and m.status = 'active'
  where e.organization_id = c.organization_id and e.id = any (p_employee_ids) and e.user_id is not null
    and public.user_has_branch_access(c.organization_id, e.branch_id)
  on conflict (cycle_id, employee_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nobody was added — they need an active login and must not already be in this cycle'; end if;

  perform public.notify_user(c.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.started', 'appraisal', a.id,
    'Your ' || c.name || ' self-appraisal is ready' || coalesce(' — due ' || to_char(c.self_due, 'DD Mon'), ''), 'info'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.employee_id = any (p_employee_ids) and a.created_at > now() - interval '1 minute' and a.user_id <> auth.uid();
  perform public.log_audit(c.organization_id, 'appraisal_cycle.people_added', 'appraisal_cycle', c.id, v_n || ' added to ' || c.name, jsonb_build_object('employees', p_employee_ids));
  return v_n;
end;
$$;
grant execute on function public.add_to_appraisal_cycle(uuid, uuid[]) to authenticated;

create or replace function public.reassign_appraisal_reviewer(p_id uuid, p_reviewer uuid)
returns public.appraisals
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals; v_old uuid;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found or not public.is_appraisal_manager(a.organization_id, a.branch_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if a.status not in ('self_review', 'manager_review') then raise exception 'The review has already been submitted — send it back from sign-off instead'; end if;
  if p_reviewer = a.user_id then raise exception 'Someone cannot review their own appraisal'; end if;
  if not exists (select 1 from public.memberships m where m.organization_id = a.organization_id and m.user_id = p_reviewer and m.status = 'active') then
    raise exception 'The reviewer must be an active member of the firm';
  end if;
  v_old := a.manager_user_id;
  update public.appraisals set manager_user_id = p_reviewer, updated_at = now() where id = p_id returning * into a;
  if a.status = 'manager_review' then
    perform public.notify_user(a.organization_id, p_reviewer, auth.uid(), 'hr'::public.notification_category, 'appraisal.self_submitted', 'appraisal', a.id,
      'You are now reviewing ' || coalesce((select full_name from public.profiles where id = a.user_id), 'a team member') || '''s appraisal', 'info'::public.notification_priority);
  end if;
  perform public.log_audit(a.organization_id, 'appraisal.reviewer_changed', 'appraisal', a.id,
    'Reviewer changed to ' || coalesce((select full_name from public.profiles where id = p_reviewer), 'another member'),
    jsonb_build_object('from', v_old, 'to', p_reviewer));
  return a;
end;
$$;
grant execute on function public.reassign_appraisal_reviewer(uuid, uuid) to authenticated;

create or replace function public.mark_appraisal_filed(p_id uuid, p_document uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.appraisals;
begin
  select * into a from public.appraisals where id = p_id for update;
  if not found or not public.has_permission(a.organization_id, 'hr_documents.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if a.status <> 'completed' then raise exception 'Only completed appraisals are filed'; end if;
  if not exists (select 1 from public.hr_employee_documents d where d.id = p_document and d.organization_id = a.organization_id and d.user_id = a.user_id) then
    raise exception 'That document does not belong to this staff member';
  end if;
  update public.appraisals set filed_document_id = p_document where id = p_id;
end;
$$;
grant execute on function public.mark_appraisal_filed(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_appraisal: now includes filed_document_id (body otherwise unchanged).
-- ---------------------------------------------------------------------------
create or replace function public.get_appraisal(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.appraisals; c public.appraisal_cycles; e public.employees;
  v_role text; v_self boolean; v_mgr boolean; v_inputs boolean;
begin
  select * into a from public.appraisals where id = p_id;
  if not found then return null; end if;
  if a.user_id = auth.uid() then v_role := 'self';
  elsif a.manager_user_id = auth.uid() then v_role := 'manager';
  elsif public.is_appraisal_manager(a.organization_id, a.branch_id) then v_role := 'hr';
  elsif public.is_line_manager_of(a.organization_id, a.user_id, auth.uid()) then v_role := 'line_manager';
  else return null;
  end if;
  select * into c from public.appraisal_cycles where id = a.cycle_id;
  select * into e from public.employees where id = a.employee_id;

  -- Self answers: always to the person; to others once submitted.
  v_self := v_role = 'self' or a.self_submitted_at is not null;
  -- Manager answers: to the reviewer and HR as they're written (HR once submitted);
  -- to the person only after sign-off; to other line managers once submitted.
  v_mgr := case v_role
    when 'manager' then true
    when 'hr' then a.manager_submitted_at is not null or (a.manager_user_id is null)
    when 'line_manager' then a.manager_submitted_at is not null
    else a.status in ('acknowledge', 'completed') end;
  v_inputs := v_role in ('manager', 'hr');

  return jsonb_build_object(
    'viewer_role', v_role,
    'appraisal', jsonb_build_object(
      'id', a.id, 'organization_id', a.organization_id, 'cycle_id', a.cycle_id, 'employee_id', a.employee_id, 'user_id', a.user_id,
      'branch_id', a.branch_id, 'manager_user_id', a.manager_user_id, 'status', a.status,
      'employee_name', trim(e.first_name || ' ' || coalesce(e.last_name, '')), 'employee_number', e.employee_number,
      'job_title', (select name from public.job_titles where id = e.job_title_id),
      'department', (select name from public.departments where id = e.department_id),
      'manager_name', (select full_name from public.profiles where id = a.manager_user_id),
      'self_summary', case when v_self then a.self_summary end, 'self_overall', case when v_self then a.self_overall end,
      'self_submitted_at', a.self_submitted_at,
      'manager_summary', case when v_mgr then a.manager_summary end, 'manager_overall', case when v_mgr then a.manager_overall end,
      'manager_recommendation', case when v_mgr then a.manager_recommendation end, 'manager_submitted_at', a.manager_submitted_at,
      'final_rating', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.final_rating end,
      'recommendation', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.recommendation end,
      'sign_off_comment', case when v_role <> 'self' or a.status in ('acknowledge', 'completed') then a.sign_off_comment end,
      'signed_off_by', a.signed_off_by, 'signed_off_by_name', (select full_name from public.profiles where id = a.signed_off_by), 'signed_off_at', a.signed_off_at,
      'employee_agrees', a.employee_agrees, 'employee_comment', a.employee_comment, 'employee_signed', a.employee_signed, 'acknowledged_at', a.acknowledged_at,
      'filed_document_id', case when v_role in ('hr', 'self') then a.filed_document_id end
    ),
    'cycle', jsonb_build_object('id', c.id, 'name', c.name, 'period_start', c.period_start, 'period_end', c.period_end,
      'self_due', c.self_due, 'manager_due', c.manager_due, 'status', c.status, 'competencies', c.competencies),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
        'competency', s.competency,
        'self_rating', case when v_self then s.self_rating end, 'self_comment', case when v_self then s.self_comment end,
        'manager_rating', case when v_mgr then s.manager_rating end, 'manager_comment', case when v_mgr then s.manager_comment end) order by s.competency)
      from public.appraisal_scores s where s.appraisal_id = a.id), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title,
        'self_rating', case when v_self then g.self_rating end, 'self_comment', case when v_self then g.self_comment end,
        'manager_rating', case when v_mgr then g.manager_rating end, 'manager_comment', case when v_mgr then g.manager_comment end) order by g.position)
      from public.appraisal_goals g where g.appraisal_id = a.id and (v_self or v_role = 'manager')), '[]'::jsonb),
    'inputs', case when v_inputs then coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'rating', i.rating, 'comment', i.comment, 'at', i.updated_at))
      from public.appraisal_inputs i left join public.profiles p on p.id = i.user_id where i.appraisal_id = a.id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('name', 'You', 'rating', i.rating, 'comment', i.comment, 'at', i.updated_at))
      from public.appraisal_inputs i where i.appraisal_id = a.id and i.user_id = auth.uid()), '[]'::jsonb) end
  );
end;
$$;
