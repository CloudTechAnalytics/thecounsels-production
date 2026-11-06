-- ============================================================================
-- Migration 0204 — Leave: working days, public holidays, accrual.
--
-- • leave_settings.working_days: the firm's working week (ISO days, Mon=1 …
--   Sun=7; default Mon–Fri).
-- • public_holidays: firm-wide or per branch. Not counted as leave.
-- • leave_types.counts_working_days (default on): weekends and holidays are
--   not charged. Off = calendar days (e.g. maternity).
-- • leave_types.accrues (default off): the entitlement is earned 1/12 per
--   month through the year — from the month they joined if they joined this
--   year — rounded down to the half day.
-- • Pending requests now count against the balance, so two requests can't
--   together exceed it.
-- request_leave() uses all of this; leave_preview() gives the app the same
-- numbers before submitting, and my_leave_summary() the balances.
-- ============================================================================

create table if not exists public.leave_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  working_days    smallint[] not null default '{1,2,3,4,5}' check (working_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(working_days) between 1 and 7),
  updated_at      timestamptz not null default now()
);

create table if not exists public.public_holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete cascade,
  holiday_date    date not null,
  name            text not null check (length(trim(name)) between 1 and 120),
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_public_holidays on public.public_holidays (organization_id, holiday_date, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_public_holidays_org on public.public_holidays (organization_id, holiday_date);

alter table public.leave_types
  add column if not exists counts_working_days boolean not null default true,
  add column if not exists accrues boolean not null default false;

alter table public.leave_settings enable row level security;
alter table public.public_holidays enable row level security;

drop policy if exists leave_settings_select on public.leave_settings;
create policy leave_settings_select on public.leave_settings for select using (public.is_org_member(organization_id));
drop policy if exists leave_settings_write on public.leave_settings;
create policy leave_settings_write on public.leave_settings for all
  using (public.has_permission(organization_id, 'leave.manage') or public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'leave.manage') or public.has_permission(organization_id, 'departments.manage'));

drop policy if exists public_holidays_select on public.public_holidays;
create policy public_holidays_select on public.public_holidays for select using (public.is_org_member(organization_id));
drop policy if exists public_holidays_write on public.public_holidays;
create policy public_holidays_write on public.public_holidays for all
  using (public.has_permission(organization_id, 'leave.manage') or public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'leave.manage') or public.has_permission(organization_id, 'departments.manage'));

grant select, insert, update, delete on public.leave_settings, public.public_holidays to authenticated;

-- Days charged for a period, for one person and leave type.
create or replace function public.leave_days_between(p_org uuid, p_user uuid, p_type uuid, p_start date, p_end date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_end < p_start then 0
    when not coalesce((select counts_working_days from public.leave_types where id = p_type), true) then (p_end - p_start + 1)::numeric
    else (
      select count(*)::numeric
      from generate_series(p_start, p_end, interval '1 day') g(d)
      where extract(isodow from g.d)::smallint = any (coalesce((select working_days from public.leave_settings where organization_id = p_org), '{1,2,3,4,5}'))
        and not exists (
          select 1 from public.public_holidays h
          where h.organization_id = p_org and h.holiday_date = g.d::date
            and (h.branch_id is null or h.branch_id = public.employee_branch(p_org, p_user)))
    )
  end;
$$;
revoke execute on function public.leave_days_between(uuid, uuid, uuid, date, date) from public, anon, authenticated;

-- Entitlement, accrued so far (as at p_on), used, pending and available.
create or replace function public.leave_allowance(p_org uuid, p_user uuid, p_type uuid, p_on date)
returns table (entitlement numeric, accrued numeric, used numeric, pending numeric, available numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from p_on)::int;
  v_ent numeric; v_used numeric; v_pending numeric; v_accrues boolean; v_start date; v_from int; v_months int; v_acc numeric;
begin
  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0), t.accrues
    into v_ent, v_used, v_accrues
  from public.leave_types t
  left join public.leave_balances b on b.organization_id = p_org and b.user_id = p_user and b.leave_type_id = t.id and b.year = v_year
  where t.id = p_type;
  select coalesce(sum(days), 0) into v_pending from public.leave_requests
  where organization_id = p_org and user_id = p_user and leave_type_id = p_type and status = 'pending'
    and extract(year from start_date)::int = v_year;

  if coalesce(v_accrues, false) then
    select start_date into v_start from public.employees where organization_id = p_org and user_id = p_user limit 1;
    v_from := case when v_start is not null and extract(year from v_start)::int = v_year then extract(month from v_start)::int
                   when v_start is not null and extract(year from v_start)::int > v_year then 13
                   else 1 end;
    v_months := greatest(0, extract(month from p_on)::int - v_from + 1);
    v_acc := floor((v_ent * v_months / 12.0) * 2) / 2;
  else
    v_acc := v_ent;
  end if;
  return query select round(v_ent, 1), round(v_acc, 1), round(v_used, 1), round(v_pending, 1), round(greatest(v_acc - v_used - v_pending, 0), 1);
end;
$$;
revoke execute on function public.leave_allowance(uuid, uuid, uuid, date) from public, anon, authenticated;

-- For the apply form: what this period would cost and what's available.
create or replace function public.leave_preview(p_org uuid, p_type uuid, p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare a record; v_days numeric; v_cal int;
begin
  if not public.is_org_member(p_org) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if p_end < p_start then return jsonb_build_object('error', 'End date must be on or after the start date'); end if;
  if p_end - p_start > 366 then return jsonb_build_object('error', 'That period is too long'); end if;
  v_days := public.leave_days_between(p_org, auth.uid(), p_type, p_start, p_end);
  v_cal := p_end - p_start + 1;
  select * into a from public.leave_allowance(p_org, auth.uid(), p_type, p_start);
  return jsonb_build_object(
    'days', v_days, 'calendar_days', v_cal,
    'counts_working_days', coalesce((select counts_working_days from public.leave_types where id = p_type), true),
    'accrues', coalesce((select accrues from public.leave_types where id = p_type), false),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('date', h.holiday_date, 'name', h.name) order by h.holiday_date)
       from public.public_holidays h where h.organization_id = p_org and h.holiday_date between p_start and p_end
         and (h.branch_id is null or h.branch_id = public.employee_branch(p_org, auth.uid()))), '[]'::jsonb),
    'entitlement', a.entitlement, 'accrued', a.accrued, 'used', a.used, 'pending', a.pending, 'available', a.available);
end;
$$;
grant execute on function public.leave_preview(uuid, uuid, date, date) to authenticated;

-- Balances for the signed-in person, every leave type, this year.
create or replace function public.my_leave_summary(p_org uuid)
returns table (leave_type_id uuid, name text, entitlement numeric, accrued numeric, used numeric, pending numeric, available numeric, accrues boolean, counts_working_days boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, a.entitlement, a.accrued, a.used, a.pending, a.available, t.accrues, t.counts_working_days
  from public.leave_types t
  cross join lateral public.leave_allowance(p_org, auth.uid(), t.id, current_date) a
  where t.organization_id = p_org and public.is_org_member(p_org)
  order by t.name;
$$;
grant execute on function public.my_leave_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- request_leave: working days, holidays, accrual and pending requests.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_leave(p_org uuid, p_leave_type uuid, p_start date, p_end date, p_reason text DEFAULT NULL::text)
 RETURNS leave_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := public.leave_days_between(p_org, auth.uid(), p_leave_type, p_start, p_end);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  if v_days <= 0 then
    raise exception 'Those dates fall on non-working days or public holidays — there is nothing to take';
  end if;
  select available, accrued into v_taken, v_limit from public.leave_allowance(p_org, auth.uid(), p_leave_type, p_start);
  if v_days > v_taken then
    raise exception '% needs % day(s), but only % day(s) are available (% earned so far, including pending requests)', v_type_name, v_days, v_taken, v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.approval_allows(p_org, 'leave', m.user_id, public.employee_branch(p_org, auth.uid()), auth.uid())
    and not public.is_line_manager_of(p_org, auth.uid(), m.user_id);

  -- The line manager approves their team's leave.
  if public.line_manager_user(p_org, auth.uid()) is not null then
    perform public.notify_user(p_org, lm.u, auth.uid(), 'hr', 'leave.requested',
      'leave_request', rec.id, 'A team member''s leave request needs your approval', 'info')
    from public.line_manager_users(p_org, auth.uid()) lm(u);
  end if;

  return rec;
end;
$function$;
