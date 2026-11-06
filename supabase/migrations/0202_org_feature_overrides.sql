-- ============================================================================
-- Migration 0202 — per-firm feature overrides.
--
-- A platform admin can switch any plan feature ON or OFF for one firm,
-- whatever its plan: e.g. a Business firm that doesn't want AI, or a
-- Professional firm given Payroll as a one-off. No row = follow the plan.
--
-- org_has_feature() — the single gate every RLS policy, RPC and edge
-- function already calls — now checks the firm's override first, so an
-- override takes effect everywhere at once, server side included.
-- Overrides survive plan changes. Only platform admins can set them, through
-- set_org_feature(), and every change is written to the platform audit log.
-- ============================================================================

create table if not exists public.organization_feature_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature         text not null check (feature in (
                    'messaging', 'whatsapp_reminders', 'hr_module', 'ai_summarization', 'appointments',
                    'inventory', 'power_management', 'surveys', 'appraisals', 'circulars', 'fund_requests', 'payroll')),
  enabled         boolean not null,
  note            text,
  set_by          uuid references auth.users(id) on delete set null,
  set_at          timestamptz not null default now(),
  primary key (organization_id, feature)
);

alter table public.organization_feature_overrides enable row level security;
-- The firm's own members read them (the app needs them to show the right
-- menus); platform admins read all. Writes only through set_org_feature().
drop policy if exists organization_feature_overrides_select on public.organization_feature_overrides;
create policy organization_feature_overrides_select on public.organization_feature_overrides
  for select using (public.is_platform_admin() or public.is_org_member(organization_id));
grant select on public.organization_feature_overrides to authenticated;

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.enabled from public.organization_feature_overrides o where o.organization_id = p_org and o.feature = p_feature),
    (select (p.features ->> p_feature)::boolean
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
      where s.organization_id = p_org),
    false
  );
$$;

-- p_enabled: true = force on, false = force off, null = back to the plan default.
create or replace function public.set_org_feature(p_org uuid, p_feature text, p_enabled boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_plan boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can change a firm''s features' using errcode = '42501';
  end if;
  select name into v_name from public.organizations where id = p_org;
  if v_name is null then raise exception 'Organization not found'; end if;

  if p_enabled is null then
    delete from public.organization_feature_overrides where organization_id = p_org and feature = p_feature;
  else
    insert into public.organization_feature_overrides (organization_id, feature, enabled, note, set_by, set_at)
    values (p_org, p_feature, p_enabled, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), now())
    on conflict (organization_id, feature)
    do update set enabled = excluded.enabled, note = excluded.note, set_by = excluded.set_by, set_at = now();
  end if;

  select (p.features ->> p_feature)::boolean into v_plan
  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = p_org;

  perform public.log_audit(p_org, 'organization.feature_override', 'organization', p_org,
    case when p_enabled is null then p_feature || ' set back to plan default for ' || v_name
         when p_enabled then p_feature || ' turned ON for ' || v_name
         else p_feature || ' turned OFF for ' || v_name end,
    jsonb_build_object('feature', p_feature, 'enabled', p_enabled, 'plan_default', coalesce(v_plan, false), 'note', p_note),
    true);
end;
$$;
revoke execute on function public.set_org_feature(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_org_feature(uuid, text, boolean, text) to authenticated;
