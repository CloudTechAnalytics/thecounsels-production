-- ============================================================================
-- Migration 0087 — Enforce the configured leave limit at request time, and
-- fix the "notify approvers" fan-out.
--
-- 1. request_leave() previously never checked remaining balance — any
--    request could be submitted regardless of how many days were left,
--    leaving it entirely to the approver's judgment. Now it computes the
--    same limit/taken/balance the summary table shows and rejects a
--    request that would exceed what's actually left, with a clear message
--    stating exactly how many days remain.
--
-- 2. The notify-approvers loop used has_permission(p_org, 'leave.manage')
--    inside the WHERE clause of a query fanning out over OTHER users —
--    has_permission() always checks the CALLING user (auth.uid()), not
--    whichever membership row the query is currently looking at. So it
--    evaluated to one constant true/false for the entire loop based on
--    the REQUESTER's own permission: if the requester happened to also
--    hold leave.manage, literally everyone in the org got notified; if
--    not (the normal case), nobody did. Replaced with a direct check of
--    each candidate's own role_permissions.
-- ============================================================================

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
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0)
    into v_limit, v_taken
    from public.leave_types t
    left join public.leave_balances b
      on b.organization_id = p_org and b.user_id = auth.uid() and b.leave_type_id = p_leave_type and b.year = v_year
    where t.id = p_leave_type;

  if v_days > (v_limit - v_taken) then
    raise exception '% requires % day(s), but only % day(s) remain of your % limit', v_type_name, v_days, (v_limit - v_taken), v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions perm on perm.id = rp.permission_id and perm.key = 'leave.manage'
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid();

  return rec;
end;
$$;
