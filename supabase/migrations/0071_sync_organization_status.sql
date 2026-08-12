-- ============================================================================
-- Migration 0071 — Keep organizations.status in sync with subscriptions.status.
--
-- Root cause of "org shows Business plan but status still says Trial even
-- after paying": organizations.status is only ever set once, at creation
-- (always 'trial') — nothing ever updated it afterward. paystack-webhook
-- correctly flips subscriptions.status to 'active' on payment (that's why
-- the Plan badge was right), but organizations.status itself was never
-- touched, so it stayed frozen at 'trial' forever regardless of real
-- payment state. cancel_subscription() had the identical gap for
-- cancellations.
--
-- Fix has two parts:
--   1. One-time backfill below — corrects every organization that's
--      already in this stale state right now (including Law Castle Firm).
--   2. cancel_subscription() now also syncs organizations.status.
--   The paystack-webhook Edge Function needs a matching code change
--   (separate deploy — see its own file) to keep doing this going forward
--   for the 'active' transition, since that's a Deno function, not SQL.
-- ============================================================================

-- One-time backfill: any org whose subscription is genuinely active but
-- whose own status column never caught up.
update public.organizations o
set status = 'active'
where o.status = 'trial'
  and exists (
    select 1 from public.subscriptions s
    where s.organization_id = o.id and s.status = 'active'
  );

-- ----------------------------------------------------------------------------
-- organizations.storage_used_bytes has existed since 0006 but nothing has
-- ever written to it — every upload/delete path only ever touched
-- documents.size_bytes, never this column, so it's permanently 0 regardless
-- of real usage ("Storage" showing 0 GB in the Platform Console no matter
-- how many documents exist). Rather than adding yet another manually-
-- maintained counter that can silently drift (the exact bug class fixed
-- twice already today — seats, next_billing_date), this computes it live
-- from the one real source of truth: documents.size_bytes itself.
-- Platform-admin-only, matching every other platform-wide aggregate.
-- ----------------------------------------------------------------------------
create or replace function public.platform_storage_usage()
returns table (organization_id uuid, total_bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d.organization_id, coalesce(sum(d.size_bytes), 0)::bigint
  from public.documents d
  where public.is_platform_admin()
  group by d.organization_id;
$$;

grant execute on function public.platform_storage_usage() to authenticated;

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

  update public.organizations set status = 'cancelled' where id = p_org;

  perform public.log_audit(p_org, 'subscription.cancelled', 'subscription', rec.id,
    'Subscription cancelled', jsonb_build_object('reason', p_reason));
  return rec;
end;
$$;
