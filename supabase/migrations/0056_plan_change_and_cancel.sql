-- Commercial Model Overhaul, Part F — upgrade/downgrade/cancel RPCs behind
-- the new Plan & Billing management UI. All three are organization.manage-
-- gated (the same permission already correctly excluding Senior Associates,
-- per research — no new permission key needed).

-- Downgrades are scheduled for the next billing date, never applied
-- immediately — no feature/data loss for what's already been paid for.
-- The pg_cron job (0055) applies it once scheduled_change_at arrives.
create or replace function public.schedule_plan_downgrade(p_org uuid, p_plan_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = p_plan_id,
      scheduled_change_at = coalesce(current_period_end, trial_ends_at, now())
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  perform public.log_audit(p_org, 'subscription.downgrade_scheduled', 'subscription', rec.id,
    'Plan downgrade scheduled', jsonb_build_object('plan_id', p_plan_id, 'effective_at', rec.scheduled_change_at));
  return rec;
end;
$$;

create or replace function public.cancel_scheduled_downgrade(p_org uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = null, scheduled_change_at = null
  where organization_id = p_org
  returning * into rec;

  return rec;
end;
$$;

create or replace function public.cancel_subscription(p_org uuid, p_reason text default null)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  perform public.log_audit(p_org, 'subscription.cancelled', 'subscription', rec.id,
    'Subscription cancelled', jsonb_build_object('reason', p_reason));
  return rec;
end;
$$;

grant execute on function public.schedule_plan_downgrade(uuid, uuid) to authenticated;
grant execute on function public.cancel_scheduled_downgrade(uuid) to authenticated;
grant execute on function public.cancel_subscription(uuid, text) to authenticated;
