-- ============================================================================
-- Migration 0195 — Inventory: office assets and supplies.
--
-- inventory_items       one row per ASSET (laptop, phone, printer, chair,
--                       vehicle — tagged AST-0001, assigned to a person) or
--                       per SUPPLY line (paper, toner, files — a quantity
--                       with a reorder level), each in a branch.
-- inventory_movements   the full history: received, issued, returned,
--                       adjusted, assigned, unassigned, repair, disposed.
-- inventory_requests    staff ask for an item; their line manager or an
--                       inventory manager approves; an inventory manager
--                       issues it (stock goes down / asset is assigned).
--
-- Quantities and assignments change only through the RPCs below so the
-- history always adds up. Inventory managers = 'inventory.manage' (Managing
-- Partner, Finance, HR roles, IT administrator), limited to their branches.
-- "Who approves what" gains an 'inventory' area.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('inventory.manage', 'inventory', 'manage', 'Manage office assets and supplies, approve and issue requests')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'inventory.manage'
where r.key in ('managing_partner', 'finance', 'hr_manager', 'hr_administrator', 'hr', 'it_administrator')
on conflict do nothing;

create table if not exists public.inventory_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  kind            text not null check (kind in ('asset', 'supply')),
  name            text not null check (length(trim(name)) between 1 and 160),
  category        text,
  tag_no          text,
  serial_no       text,
  description     text,
  -- supplies
  unit            text,
  quantity        numeric(12,2) not null default 0 check (quantity >= 0),
  reorder_level   numeric(12,2),
  unit_cost       numeric(14,2),
  -- assets
  purchase_date   date,
  purchase_cost   numeric(14,2),
  supplier        text,
  warranty_until  date,
  condition       text check (condition in ('new', 'good', 'fair', 'poor', 'damaged')),
  status          text not null default 'in_store' check (status in ('in_store', 'assigned', 'repair', 'disposed', 'lost')),
  assigned_employee_id uuid references public.employees(id) on delete set null,
  assigned_at     timestamptz,
  assignment_acknowledged_at timestamptz,
  location        text,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_inventory_items_org on public.inventory_items (organization_id, kind, branch_id);
create index if not exists idx_inventory_items_assignee on public.inventory_items (assigned_employee_id);
create unique index if not exists inventory_items_tag on public.inventory_items (organization_id, tag_no) where tag_no is not null;

create table if not exists public.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id         uuid not null references public.inventory_items(id) on delete cascade,
  kind            text not null check (kind in ('received', 'issued', 'returned', 'adjusted', 'assigned', 'unassigned', 'repair', 'disposed', 'lost', 'moved')),
  quantity        numeric(12,2),
  balance_after   numeric(12,2),
  employee_id     uuid references public.employees(id) on delete set null,
  request_id      uuid,
  unit_cost       numeric(14,2),
  note            text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists idx_inventory_movements_item on public.inventory_movements (item_id, created_at desc);

create table if not exists public.inventory_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  item_id         uuid references public.inventory_items(id) on delete set null,
  item_name       text not null,
  quantity        numeric(12,2) not null default 1 check (quantity > 0),
  reason          text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'issued', 'cancelled')),
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  decision_note   text,
  issued_by       uuid references public.profiles(id) on delete set null,
  issued_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_inventory_requests_org on public.inventory_requests (organization_id, status, created_at desc);

-- Asset tags: AST-0001 per firm.
create or replace function public.assign_asset_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if new.kind = 'asset' and coalesce(trim(new.tag_no), '') = '' then
    select coalesce(max(nullif(regexp_replace(tag_no, '\D', '', 'g'), '')::int), 0) + 1 into v_n
    from public.inventory_items where organization_id = new.organization_id and kind = 'asset' and tag_no like 'AST-%';
    new.tag_no := 'AST-' || lpad(v_n::text, 4, '0');
  end if;
  if new.kind = 'supply' then
    new.status := 'in_store';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_inventory_items_tag on public.inventory_items;
create trigger trg_inventory_items_tag before insert or update on public.inventory_items
  for each row execute function public.assign_asset_tag();

-- Helpers -------------------------------------------------------------------
create or replace function public.is_inventory_manager(p_org uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'inventory.manage') and public.user_has_branch_access(p_org, p_branch);
$$;
grant execute on function public.is_inventory_manager(uuid, uuid) to authenticated;

create or replace function public.notify_inventory_managers(p_org uuid, p_branch uuid, p_except uuid, p_action text, p_entity text, p_id uuid, p_title text, p_level text default 'info')
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify_user(p_org, m.user_id, auth.uid(), 'hr'::public.notification_category, p_action, p_entity, p_id, p_title, p_level::public.notification_priority)
  from public.memberships m
  where m.organization_id = p_org and m.status = 'active' and m.user_id is distinct from p_except
    and public.member_has_permission(p_org, m.user_id, 'inventory.manage')
    and public.member_has_branch_access(p_org, m.user_id, p_branch);
$$;
revoke execute on function public.notify_inventory_managers(uuid, uuid, uuid, text, text, uuid, text, text) from public, anon, authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_requests enable row level security;

-- Managers see their branch's register; everyone sees the supplies they can
-- request and the assets assigned to them.
drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items
  for select using (
    public.is_inventory_manager(organization_id, branch_id)
    or (kind = 'supply' and public.is_org_member(organization_id) and public.user_has_branch_access(organization_id, branch_id))
    or exists (select 1 from public.employees e where e.id = inventory_items.assigned_employee_id and e.user_id = auth.uid())
  );
drop policy if exists inventory_items_write on public.inventory_items;
create policy inventory_items_write on public.inventory_items
  for all using (public.is_inventory_manager(organization_id, branch_id))
  with check (public.is_inventory_manager(organization_id, branch_id) and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements
  for select using (
    exists (select 1 from public.inventory_items i where i.id = inventory_movements.item_id and public.is_inventory_manager(i.organization_id, i.branch_id))
    or exists (select 1 from public.employees e where e.id = inventory_movements.employee_id and e.user_id = auth.uid())
  );

drop policy if exists inventory_requests_select on public.inventory_requests;
create policy inventory_requests_select on public.inventory_requests
  for select using (
    user_id = auth.uid()
    or public.is_inventory_manager(organization_id, branch_id)
    or public.line_manager_user(organization_id, user_id) = auth.uid()
  );

-- Movements -----------------------------------------------------------------
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
grant execute on function public.inventory_move(uuid, text, numeric, uuid, text, numeric, text) to authenticated;

-- The person an asset is assigned to confirms they received it.
create or replace function public.acknowledge_asset(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_items i set assignment_acknowledged_at = now()
  where i.id = p_item and i.status = 'assigned'
    and exists (select 1 from public.employees e where e.id = i.assigned_employee_id and e.user_id = auth.uid());
  if not found then
    raise exception 'This item is not assigned to you';
  end if;
end;
$$;
grant execute on function public.acknowledge_asset(uuid) to authenticated;

-- Requests ------------------------------------------------------------------
create or replace function public.request_inventory(p_org uuid, p_item uuid, p_item_name text, p_quantity numeric, p_reason text default null)
returns public.inventory_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.inventory_requests;
  it public.inventory_items;
  v_branch uuid := public.employee_branch(p_org, auth.uid());
  v_mgr uuid := public.line_manager_user(p_org, auth.uid());
begin
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
    perform public.notify_user(p_org, v_mgr, auth.uid(), 'hr', 'inventory.requested', 'inventory_request', rec.id,
      'A team member asked for ' || rec.item_name || ' — please approve', 'info');
  else
    perform public.notify_inventory_managers(p_org, v_branch, auth.uid(), 'inventory.requested', 'inventory_request', rec.id,
      'Request for ' || rec.item_name || ' needs approval');
  end if;
  return rec;
end;
$$;
grant execute on function public.request_inventory(uuid, uuid, text, numeric, text) to authenticated;

create or replace function public.decide_inventory_request(p_id uuid, p_approve boolean, p_note text default null)
returns public.inventory_requests
language plpgsql
security definer
set search_path = public
as $$
declare rec public.inventory_requests;
begin
  select * into rec from public.inventory_requests where id = p_id for update;
  if rec.id is null then raise exception 'Request not found'; end if;
  if rec.user_id = auth.uid() then raise exception 'You cannot approve your own request'; end if;
  if rec.status <> 'pending' then raise exception 'This request has already been %', rec.status; end if;
  if public.line_manager_user(rec.organization_id, rec.user_id) is distinct from auth.uid()
     and not public.approval_allows(rec.organization_id, 'inventory', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted — the requester''s line manager or an inventory manager approves' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Give a reason'; end if;
  update public.inventory_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id returning * into rec;
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'inventory.decided', 'inventory_request', rec.id,
    'Your request for ' || rec.item_name || case when p_approve then ' was approved' else ' was declined: ' || trim(p_note) end, 'info');
  if p_approve then
    perform public.notify_inventory_managers(rec.organization_id, rec.branch_id, auth.uid(), 'inventory.to_issue', 'inventory_request', rec.id,
      'Approved — please issue ' || rec.item_name || ' ×' || rec.quantity);
  end if;
  return rec;
end;
$$;
grant execute on function public.decide_inventory_request(uuid, boolean, text) to authenticated;

-- Issue an approved request: supplies leave stock; an asset is assigned.
create or replace function public.issue_inventory_request(p_id uuid, p_item uuid default null)
returns public.inventory_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.inventory_requests;
  it public.inventory_items;
  v_emp uuid;
begin
  select * into rec from public.inventory_requests where id = p_id for update;
  if rec.id is null then raise exception 'Request not found'; end if;
  if rec.status <> 'approved' then raise exception 'Only approved requests can be issued'; end if;
  if rec.user_id = auth.uid() then raise exception 'Someone else must issue your own request'; end if;
  select * into it from public.inventory_items where id = coalesce(p_item, rec.item_id) and organization_id = rec.organization_id;
  if it.id is null then raise exception 'Choose the item to issue from the register'; end if;
  select id into v_emp from public.employees where organization_id = rec.organization_id and user_id = rec.user_id;
  if it.kind = 'supply' then
    perform public.inventory_move(it.id, 'issued', rec.quantity, v_emp, 'Request by ' || coalesce((select full_name from public.profiles where id = rec.user_id), 'staff'));
  else
    if v_emp is null then raise exception 'The requester has no staff record to assign the asset to'; end if;
    perform public.inventory_move(it.id, 'assigned', null, v_emp, 'Issued on request');
  end if;
  update public.inventory_movements set request_id = rec.id
  where id = (select id from public.inventory_movements where item_id = it.id order by created_at desc limit 1);
  update public.inventory_requests set status = 'issued', issued_by = auth.uid(), issued_at = now(), item_id = it.id
  where id = p_id returning * into rec;
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'inventory.issued', 'inventory_request', rec.id,
    rec.item_name || ' has been issued to you', 'info');
  return rec;
end;
$$;
grant execute on function public.issue_inventory_request(uuid, uuid) to authenticated;

create or replace function public.cancel_inventory_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_requests set status = 'cancelled' where id = p_id and user_id = auth.uid() and status in ('pending', 'approved');
  if not found then raise exception 'Only your own pending or approved requests can be cancelled'; end if;
end;
$$;
grant execute on function public.cancel_inventory_request(uuid) to authenticated;

-- "Who approves what" learns the inventory area.
alter table public.approval_rules drop constraint if exists approval_rules_area_check;
alter table public.approval_rules add constraint approval_rules_area_check
  check (area in ('leave', 'hr_request', 'payroll', 'salary', 'fund_finance', 'reimbursement', 'inventory'));
create or replace function public.approval_area_permission(p_area text)
returns text
language sql
immutable
as $$
  select case p_area
    when 'leave' then 'leave.manage'
    when 'hr_request' then 'hr_requests.manage'
    when 'payroll' then 'payroll.manage'
    when 'salary' then 'payroll.manage'
    when 'fund_finance' then 'funds.manage'
    when 'reimbursement' then 'funds.approve'
    when 'inventory' then 'inventory.manage'
  end;
$$;
create or replace function public.approval_candidates(p_org uuid)
returns table (area text, kind text, value text, label text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with areas(area) as (values ('leave'), ('hr_request'), ('payroll'), ('salary'), ('fund_finance'), ('reimbursement'), ('inventory'))
  select a.area, 'role', ro.key::text, ro.name, null
  from areas a
  join public.roles ro on ro.organization_id is null or ro.organization_id = p_org
  where public.is_org_member(p_org)
    and ro.key::text not like 'platform%'
    and exists (
      select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
      where rp.role_id = ro.id and p.key = public.approval_area_permission(a.area))
  union all
  select a.area, 'person', m.user_id::text, coalesce(pr.full_name, pr.email), ro.name
  from areas a
  join public.memberships m on m.organization_id = p_org and m.status = 'active'
  join public.profiles pr on pr.id = m.user_id
  join public.roles ro on ro.id = m.role_id
  where public.is_org_member(p_org)
    and public.member_has_permission(p_org, m.user_id, public.approval_area_permission(a.area));
$$;
create or replace function public.my_approval_rights(p_org uuid)
returns table (area text, branch_id uuid, allowed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with areas(area) as (values ('leave'), ('hr_request'), ('payroll'), ('salary'), ('fund_finance'), ('reimbursement'), ('inventory')),
       scopes(branch_id) as (select null::uuid union all select b.id from public.branches b where b.organization_id = p_org)
  select a.area, s.branch_id, public.approval_allows(p_org, a.area, auth.uid(), s.branch_id, null)
  from areas a cross join scopes s
  where public.is_org_member(p_org);
$$;
