-- ============================================================================
-- Migration 0158 — Resource usage monitoring + alerting.
--
-- User's real worry: still on Supabase's Free tier (500MB database, 1GB
-- storage), with a real 25-user org onboarding in September, and no way to
-- know in advance if that org's usage is creeping toward either cap.
--
-- Two caps live in platform_settings (db_cap_mb/storage_cap_mb), defaulted
-- to today's actual Free-tier limits — update these here the day this
-- project ever moves to Pro or a higher tier, and every threshold below
-- adjusts automatically with them.
--
-- Two functions, deliberately separate:
--   - platform_resource_usage(): read-only, is_platform_admin()-gated, for
--     the on-demand check in Platform Console > System Health.
--   - internal_check_resource_alert(): does the same computation but also
--     decides whether to alert and updates the "already alerted" state.
--     Only ever invoked by the check-resource-usage edge function running
--     as service_role (a cron job, not a real logged-in admin — auth.uid()
--     is null in that context, so an is_platform_admin() gate would block
--     its own legitimate caller). Revoked from anon/authenticated instead;
--     the numbers it touches are low-sensitivity aggregate byte counts,
--     not tenant data, so this is a proportionate boundary, not the
--     open-to-anon gap fixed in 0156/0157 — those write and this reads.
-- ============================================================================

alter table public.platform_settings
  add column if not exists db_cap_mb integer not null default 500,
  add column if not exists storage_cap_mb integer not null default 1024,
  add column if not exists resource_alert_last_pct integer;

create or replace function public.platform_resource_usage()
returns table (
  db_bytes bigint,
  storage_bytes bigint,
  db_cap_bytes bigint,
  storage_cap_bytes bigint,
  db_pct numeric,
  storage_pct numeric
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_db_bytes bigint;
  v_storage_bytes bigint;
  v_db_cap_mb integer;
  v_storage_cap_mb integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can view resource usage' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into v_db_bytes;
  select coalesce(sum((metadata->>'size')::bigint), 0) into v_storage_bytes from storage.objects;
  select ps.db_cap_mb, ps.storage_cap_mb into v_db_cap_mb, v_storage_cap_mb from public.platform_settings ps where ps.id = true;

  return query select
    v_db_bytes,
    v_storage_bytes,
    v_db_cap_mb::bigint * 1024 * 1024,
    v_storage_cap_mb::bigint * 1024 * 1024,
    round(v_db_bytes::numeric / (v_db_cap_mb::numeric * 1024 * 1024) * 100, 1),
    round(v_storage_bytes::numeric / (v_storage_cap_mb::numeric * 1024 * 1024) * 100, 1);
end;
$$;

revoke all on function public.platform_resource_usage() from public;
grant execute on function public.platform_resource_usage() to authenticated;

-- Alert once per 15-point band (70/85/95/100+) rather than every single
-- day once crossed once — resource_alert_last_pct tracks the highest band
-- already alerted on, resets to null whenever usage drops back under 70%
-- (e.g. old documents cleaned up, or the plan gets upgraded), so a later
-- re-crossing alerts again instead of staying silent forever.
create or replace function public.internal_check_resource_alert()
returns table (should_alert boolean, message text, db_pct numeric, storage_pct numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_db_bytes bigint;
  v_storage_bytes bigint;
  v_db_cap_mb integer;
  v_storage_cap_mb integer;
  v_db_pct numeric;
  v_storage_pct numeric;
  v_worst_pct numeric;
  v_band integer;
  v_last_band integer;
  v_msg text;
begin
  select pg_database_size(current_database()) into v_db_bytes;
  select coalesce(sum((metadata->>'size')::bigint), 0) into v_storage_bytes from storage.objects;
  select ps.db_cap_mb, ps.storage_cap_mb, ps.resource_alert_last_pct
    into v_db_cap_mb, v_storage_cap_mb, v_last_band
    from public.platform_settings ps where ps.id = true;

  v_db_pct := round(v_db_bytes::numeric / (v_db_cap_mb::numeric * 1024 * 1024) * 100, 1);
  v_storage_pct := round(v_storage_bytes::numeric / (v_storage_cap_mb::numeric * 1024 * 1024) * 100, 1);
  v_worst_pct := greatest(v_db_pct, v_storage_pct);

  v_band := case
    when v_worst_pct >= 95 then 95
    when v_worst_pct >= 85 then 85
    when v_worst_pct >= 70 then 70
    else null
  end;

  if v_band is null then
    if v_last_band is not null then
      update public.platform_settings set resource_alert_last_pct = null where id = true;
    end if;
    return query select false, null::text, v_db_pct, v_storage_pct;
    return;
  end if;

  if v_last_band is not null and v_last_band >= v_band then
    return query select false, null::text, v_db_pct, v_storage_pct;
    return;
  end if;

  update public.platform_settings set resource_alert_last_pct = v_band where id = true;

  v_msg := format(
    'Resource usage warning: database at %s%% (%s MB of %s MB), storage at %s%% (%s MB of %s MB) of the current plan cap.',
    v_db_pct, round(v_db_bytes / 1024.0 / 1024, 1), v_db_cap_mb,
    v_storage_pct, round(v_storage_bytes / 1024.0 / 1024, 1), v_storage_cap_mb
  );

  perform public.log_audit(null, 'system.resource_warning', 'system', null, v_msg,
    jsonb_build_object('db_pct', v_db_pct, 'storage_pct', v_storage_pct, 'band', v_band), true);

  return query select true, v_msg, v_db_pct, v_storage_pct;
end;
$$;

revoke all on function public.internal_check_resource_alert() from public;
grant execute on function public.internal_check_resource_alert() to service_role;
