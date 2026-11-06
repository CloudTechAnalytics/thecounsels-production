-- ============================================================================
-- Migration 0200 — Business-plan modules.
--
-- Inventory, Electricity & Power, Surveys and Appraisals move to the
-- Business plan (and Enterprise): four new plan features, off on Starter
-- and Professional. The rest of HR & Finance stays on 'hr_module'.
--
-- Same enforcement boundary as 0101: gate CREATING new activity (adding
-- items, moving stock, new item requests, logging power, creating and
-- sending surveys, creating and launching appraisal cycles) — not
-- resolving what already exists (approving/issuing a pending request,
-- answering a survey already sent, finishing an appraisal under way), so
-- nothing is stranded if a firm is on, or moves to, a plan without it.
-- The app's route guard is the main gate; these are defence in depth.
-- ============================================================================

update public.plans set features = coalesce(features, '{}'::jsonb)
  || '{"inventory": true, "power_management": true, "surveys": true, "appraisals": true}'::jsonb
where key in ('business', 'enterprise');

update public.plans set features = coalesce(features, '{}'::jsonb)
  || '{"inventory": false, "power_management": false, "surveys": false, "appraisals": false}'::jsonb
where key in ('starter', 'professional');

update public.plans
set highlights = array_append(highlights, 'Appraisals, surveys, inventory & power management')
where key = 'business' and not ('Appraisals, surveys, inventory & power management' = any (highlights));

-- Inventory: adding / editing items.
drop policy if exists inventory_items_write on public.inventory_items;
create policy inventory_items_write on public.inventory_items
  for all using (public.is_inventory_manager(organization_id, branch_id))
  with check (public.is_inventory_manager(organization_id, branch_id) and public.org_has_feature(organization_id, 'inventory'));

-- Electricity & power: adding sources and logging.
drop policy if exists power_sources_all on public.power_sources;
create policy power_sources_all on public.power_sources
  for all using (public.is_power_manager(organization_id, branch_id))
  with check (public.is_power_manager(organization_id, branch_id) and public.org_has_feature(organization_id, 'power_management'));

drop policy if exists power_logs_insert on public.power_logs;
create policy power_logs_insert on public.power_logs
  for insert with check (
    public.org_has_feature(organization_id, 'power_management')
    and exists (select 1 from public.power_sources s where s.id = source_id and s.organization_id = power_logs.organization_id
                and public.is_power_manager(s.organization_id, s.branch_id))
  );

-- Appraisals: creating / editing cycles.
drop policy if exists appraisal_cycles_write on public.appraisal_cycles;
create policy appraisal_cycles_write on public.appraisal_cycles
  for all using (public.has_permission(organization_id, 'appraisals.manage') and status = 'draft')
  with check (public.has_permission(organization_id, 'appraisals.manage') and status = 'draft' and public.org_has_feature(organization_id, 'appraisals'));

-- ---------------------------------------------------------------------------
-- Entry-point functions: the same bodies with a plan check added up front.
-- ---------------------------------------------------------------------------
-- request_inventory: new activity needs the 'inventory' feature.
CREATE OR REPLACE FUNCTION public.request_inventory(p_org uuid, p_item uuid, p_item_name text, p_quantity numeric, p_reason text DEFAULT NULL::text)
 RETURNS inventory_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.inventory_requests;
  it public.inventory_items;
  v_branch uuid := public.employee_branch(p_org, auth.uid());
  v_mgr uuid := public.line_manager_user(p_org, auth.uid());
begin
  if not public.org_has_feature(p_org, 'inventory') then
    raise exception 'Inventory is available on the Business plan — upgrade to use it' using errcode = '42501';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_item is not null then
    select * into it from public.inventory_items where id = p_item and organization_id = p_org;
    if it.id is null then raise exception 'Item not found'; end if;
    v_branch := coalesce(it.branch_id, v_branch);
  end if;
  if coalesce(trim(coalesce(p_item_name, it.name)), '') = '' then
    raise exception 'Say what you need';
  end if;
  insert into public.inventory_requests (organization_id, branch_id, user_id, item_id, item_name, quantity, reason)
  values (p_org, v_branch, auth.uid(), p_item, coalesce(nullif(trim(p_item_name), ''), it.name), coalesce(p_quantity, 1), nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;
  if v_mgr is not null then
    perform public.notify_user(p_org, lm.u, auth.uid(), 'hr', 'inventory.requested', 'inventory_request', rec.id,
      'A team member asked for ' || rec.item_name || ' — please approve', 'info')
    from public.line_manager_users(p_org, auth.uid()) lm(u);
  else
    perform public.notify_inventory_managers(p_org, v_branch, auth.uid(), 'inventory.requested', 'inventory_request', rec.id,
      'Request for ' || rec.item_name || ' needs approval');
  end if;
  return rec;
end;
$function$;

-- inventory_move: new activity needs the 'inventory' feature.
create or replace function public.inventory_move(
  p_item uuid,
  p_kind text,
  p_quantity numeric default null,
  p_employee uuid default null,
  p_note text default null,
  p_unit_cost numeric default null,
  p_condition text default null
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.inventory_items;
  v_qty numeric(12,2);
begin
  if not public.org_has_feature((select organization_id from public.inventory_items where id = p_item), 'inventory') then
    raise exception 'Inventory is available on the Business plan — upgrade to use it' using errcode = '42501';
  end if;
  select * into it from public.inventory_items where id = p_item for update;
  if it.id is null then
    raise exception 'Item not found';
  end if;
  if not public.is_inventory_manager(it.organization_id, it.branch_id) then
    raise exception 'Only inventory managers can change stock or assignments' using errcode = '42501';
  end if;

  if it.kind = 'supply' then
    if p_kind not in ('received', 'issued', 'adjusted') then
      raise exception 'Supplies can be received, issued or adjusted';
    end if;
    if p_quantity is null or p_quantity < 0 or (p_kind <> 'adjusted' and p_quantity = 0) then
      raise exception 'Enter a quantity';
    end if;
    v_qty := case p_kind when 'received' then it.quantity + p_quantity
                         when 'issued' then it.quantity - p_quantity
                         else p_quantity end;
    if v_qty < 0 then
      raise exception 'Only % % in stock', it.quantity, coalesce(it.unit, 'units');
    end if;
    update public.inventory_items set quantity = v_qty,
      unit_cost = case when p_kind = 'received' and p_unit_cost is not null then p_unit_cost else unit_cost end
    where id = it.id returning * into it;
    insert into public.inventory_movements (organization_id, item_id, kind, quantity, balance_after, employee_id, unit_cost, note)
    values (it.organization_id, it.id, p_kind, case when p_kind = 'adjusted' then p_quantity else p_quantity end, v_qty, p_employee, p_unit_cost, nullif(trim(coalesce(p_note, '')), ''));
    if it.reorder_level is not null and v_qty <= it.reorder_level and p_kind <> 'received' then
      perform public.notify_inventory_managers(it.organization_id, it.branch_id, null, 'inventory.low_stock', 'inventory_item', it.id,
        'Low stock: ' || it.name || ' — ' || v_qty || ' ' || coalesce(it.unit, 'left'), 'warning');
    end if;
  else
    if p_kind not in ('assigned', 'unassigned', 'repair', 'disposed', 'lost', 'moved') then
      raise exception 'Unknown action for an asset';
    end if;
    if it.status in ('disposed', 'lost') and p_kind <> 'moved' then
      raise exception 'This asset has been % — it can no longer change', it.status;
    end if;
    if p_kind = 'assigned' then
      if p_employee is null or not exists (select 1 from public.employees where id = p_employee and organization_id = it.organization_id) then
        raise exception 'Choose who it is assigned to';
      end if;
      update public.inventory_items set status = 'assigned', assigned_employee_id = p_employee, assigned_at = now(), assignment_acknowledged_at = null
      where id = it.id returning * into it;
      perform public.notify_user(it.organization_id, e.user_id, auth.uid(), 'hr', 'inventory.assigned', 'inventory_item', it.id,
        it.name || ' (' || coalesce(it.tag_no, '') || ') has been assigned to you — please confirm you received it', 'info')
      from public.employees e where e.id = p_employee and e.user_id is not null;
    elsif p_kind = 'unassigned' then
      insert into public.inventory_movements (organization_id, item_id, kind, employee_id, note)
      values (it.organization_id, it.id, 'returned', it.assigned_employee_id, nullif(trim(coalesce(p_note, '')), ''));
      update public.inventory_items set status = 'in_store', assigned_employee_id = null, assigned_at = null, assignment_acknowledged_at = null,
        condition = coalesce(p_condition, condition)
      where id = it.id returning * into it;
      return it;
    elsif p_kind = 'repair' then
      update public.inventory_items set status = 'repair' where id = it.id returning * into it;
    elsif p_kind in ('disposed', 'lost') then
      update public.inventory_items set status = p_kind, assigned_employee_id = null, assigned_at = null where id = it.id returning * into it;
    end if;
    insert into public.inventory_movements (organization_id, item_id, kind, employee_id, note)
    values (it.organization_id, it.id, p_kind, coalesce(p_employee, it.assigned_employee_id), nullif(trim(coalesce(p_note, '')), ''));
  end if;

  perform public.log_audit(it.organization_id, 'inventory.' || p_kind, 'inventory_item', it.id,
    initcap(p_kind) || ': ' || it.name || coalesce(' ×' || p_quantity, ''), jsonb_build_object('quantity', p_quantity, 'employee', p_employee));
  return it;
end;
$$;

-- save_survey: new activity needs the 'surveys' feature.
create or replace function public.save_survey(
  p_org uuid, p_id uuid, p_title text, p_description text, p_anonymous boolean, p_closes_on date,
  p_audience_type text, p_department_id uuid, p_branch_id uuid, p_role_key public.role_key, p_user_ids uuid[],
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := p_id; q jsonb; i integer := 0; v_opts text[];
begin
  if not public.org_has_feature(p_org, 'surveys') then
    raise exception 'Surveys is available on the Business plan — upgrade to use it' using errcode = '42501';
  end if;
  if not public.has_permission(p_org, 'surveys.manage') or not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the survey a title'; end if;
  if p_audience_type not in ('organization', 'department', 'branch', 'role', 'employees') then
    raise exception 'Invalid audience';
  end if;
  if p_closes_on is not null and p_closes_on < current_date then raise exception 'The closing date has passed'; end if;

  if v_id is null then
    insert into public.surveys (organization_id, title, description, anonymous, closes_on, audience_type, audience_department_id,
      audience_branch_id, audience_role_key, audience_user_ids)
    values (p_org, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_anonymous, true), p_closes_on, p_audience_type,
      p_department_id, p_branch_id, p_role_key, coalesce(p_user_ids, '{}'))
    returning id into v_id;
  else
    update public.surveys set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''),
      anonymous = coalesce(p_anonymous, true), closes_on = p_closes_on, audience_type = p_audience_type,
      audience_department_id = p_department_id, audience_branch_id = p_branch_id, audience_role_key = p_role_key,
      audience_user_ids = coalesce(p_user_ids, '{}'), updated_at = now()
    where id = v_id and organization_id = p_org and status = 'draft';
    if not found then raise exception 'Only drafts can be edited'; end if;
    delete from public.survey_questions where survey_id = v_id;
  end if;

  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    i := i + 1;
    select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), '{}') into v_opts from jsonb_array_elements_text(coalesce(q->'options', '[]'::jsonb)) x;
    if q->>'kind' in ('single', 'multi') and cardinality(v_opts) < 2 then
      raise exception 'Question % needs at least two options', i;
    end if;
    insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
    values (v_id, i, q->>'kind', trim(q->>'prompt'), case when q->>'kind' in ('single', 'multi') then v_opts else '{}' end,
      coalesce((q->>'required')::boolean, true));
  end loop;
  return v_id;
end;
$$;

-- send_survey: new activity needs the 'surveys' feature.
create or replace function public.send_survey(p_id uuid)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare s public.surveys; v_n integer;
begin
  if not public.org_has_feature((select organization_id from public.surveys where id = p_id), 'surveys') then
    raise exception 'Surveys is available on the Business plan — upgrade to use it' using errcode = '42501';
  end if;
  select * into s from public.surveys where id = p_id for update;
  if not found or not public.has_permission(s.organization_id, 'surveys.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if s.status <> 'draft' then raise exception 'This survey has already been sent'; end if;
  if not exists (select 1 from public.survey_questions where survey_id = p_id) then
    raise exception 'Add at least one question';
  end if;
  if s.closes_on is not null and s.closes_on < current_date then raise exception 'The closing date has passed'; end if;

  insert into public.survey_recipients (survey_id, organization_id, user_id)
  select s.id, s.organization_id, m.user_id
  from public.memberships m
  join public.roles ro on ro.id = m.role_id
  where m.organization_id = s.organization_id and m.status = 'active'
    and (
      s.audience_type = 'organization'
      or (s.audience_type = 'employees' and m.user_id = any(s.audience_user_ids))
      or (s.audience_type = 'role' and ro.key = s.audience_role_key)
      or (s.audience_type = 'department' and (
            exists (select 1 from public.employees e where e.organization_id = s.organization_id and e.user_id = m.user_id and e.department_id = s.audience_department_id)
         or exists (select 1 from public.staff_profiles sp where sp.organization_id = s.organization_id and sp.user_id = m.user_id and sp.department_id = s.audience_department_id)))
      or (s.audience_type = 'branch' and (
            exists (select 1 from public.member_branches mb where mb.membership_id = m.id and mb.branch_id = s.audience_branch_id)
         or exists (select 1 from public.employees e where e.organization_id = s.organization_id and e.user_id = m.user_id and e.branch_id = s.audience_branch_id)))
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nobody matches that audience — choose who should answer it'; end if;

  update public.surveys set status = 'open', sent_at = now(), recipient_count = v_n, updated_at = now()
  where id = s.id returning * into s;

  perform public.notify_user(s.organization_id, r.user_id, auth.uid(), 'hr'::public.notification_category, 'survey.sent', 'survey', s.id,
    'Survey: ' || s.title || case when s.anonymous then ' (anonymous)' else '' end, 'info'::public.notification_priority)
  from public.survey_recipients r where r.survey_id = s.id and r.user_id <> auth.uid();
  perform public.log_audit(s.organization_id, 'survey.sent', 'survey', s.id, 'Sent survey: ' || s.title, jsonb_build_object('recipients', v_n));
  return s;
end;
$$;

-- launch_appraisal_cycle: new activity needs the 'appraisals' feature.
create or replace function public.launch_appraisal_cycle(p_cycle uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare c public.appraisal_cycles; v_n integer;
begin
  if not public.org_has_feature((select organization_id from public.appraisal_cycles where id = p_cycle), 'appraisals') then
    raise exception 'Appraisals is available on the Business plan — upgrade to use it' using errcode = '42501';
  end if;
  select * into c from public.appraisal_cycles where id = p_cycle for update;
  if not found or not public.has_permission(c.organization_id, 'appraisals.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'This cycle has already been launched'; end if;
  if jsonb_array_length(c.competencies) = 0 then raise exception 'Add at least one competency'; end if;
  if c.audience_type = 'branch' and c.audience_branch_id is null then raise exception 'Choose the branch'; end if;
  if c.audience_type = 'department' and c.audience_department_id is null then raise exception 'Choose the department'; end if;

  insert into public.appraisals (organization_id, cycle_id, employee_id, user_id, branch_id, manager_user_id)
  select c.organization_id, c.id, e.id, e.user_id, e.branch_id, public.line_manager_user(c.organization_id, e.user_id)
  from public.employees e
  join public.memberships m on m.organization_id = e.organization_id and m.user_id = e.user_id and m.status = 'active'
  where e.organization_id = c.organization_id and e.user_id is not null
    and e.employment_status in ('active', 'probation', 'on_leave')
    and (c.audience_type = 'organization'
         or (c.audience_type = 'branch' and e.branch_id = c.audience_branch_id)
         or (c.audience_type = 'department' and e.department_id = c.audience_department_id))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nobody with a login matches this cycle''s audience'; end if;

  update public.appraisal_cycles set status = 'open', launched_at = now(), updated_at = now() where id = c.id;
  perform public.notify_user(c.organization_id, a.user_id, auth.uid(), 'hr'::public.notification_category, 'appraisal.started', 'appraisal', a.id,
    'Your ' || c.name || ' self-appraisal is ready' || coalesce(' — due ' || to_char(c.self_due, 'DD Mon'), ''), 'info'::public.notification_priority)
  from public.appraisals a where a.cycle_id = c.id and a.user_id <> auth.uid();
  perform public.log_audit(c.organization_id, 'appraisal_cycle.launched', 'appraisal_cycle', c.id, 'Launched ' || c.name, jsonb_build_object('appraisals', v_n));
  return v_n;
end;
$$;
