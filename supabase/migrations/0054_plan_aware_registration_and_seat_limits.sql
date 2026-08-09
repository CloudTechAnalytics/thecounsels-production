-- Commercial Model Overhaul, Part B — self-service registration becomes
-- plan-aware, and seat limits are enforced for the first time anywhere in
-- this app (previously subscriptions.seats was purely informational).

-- 1. register_organization() gains a required p_plan_id — the registering
--    user's own choice among the 4 active plans, rather than always
--    resolving the single registration_settings.trial_plan_id. Always
--    creates a 'trialing' subscription at the plan's own trial_duration_days
--    (30) regardless of whether the frontend immediately follows up with a
--    Paystack checkout ("Subscribe Now") or not ("Start Free Trial") — see
--    Part C/D. This keeps org-creation atomic and payment-failure-safe: an
--    abandoned checkout never leaves a half-created organization, it just
--    sits on its normal trial.
create or replace function public.register_organization(
  p_name text,
  p_slug text,
  p_plan_id uuid,
  p_legal_name text default null,
  p_country text default null,
  p_timezone text default null,
  p_website text default null,
  p_industry text default null,
  p_user_count text default null,
  p_practice_areas text[] default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
  v_uid uuid := auth.uid();
  v_slug text;
  v_role_id uuid;
  v_plan public.plans;
  v_trial_days integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if v_plan.id is null then
    raise exception 'Select a valid plan' using errcode = 'P0001';
  end if;
  v_trial_days := coalesce(v_plan.trial_duration_days, 30);

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'firm'; end if;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.organizations (name, slug, legal_name, status, timezone, website, industry, organization_type, settings)
  values (
    p_name, v_slug, nullif(p_legal_name, ''), 'trial', coalesce(nullif(p_timezone, ''), 'UTC'),
    nullif(p_website, ''), nullif(p_industry, ''), 'customer',
    jsonb_build_object('country', p_country, 'user_count_band', p_user_count, 'practice_areas', coalesce(p_practice_areas, '{}'))
  )
  returning * into org;

  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, amount, currency, trial_ends_at, current_period_end)
  values (
    org.id, v_plan.id, 'trialing', 'monthly', coalesce(v_plan.max_users, 5), v_plan.price_monthly, v_plan.currency,
    now() + (v_trial_days || ' days')::interval,
    now() + (v_trial_days || ' days')::interval
  );

  select id into v_role_id from public.roles where key = 'managing_partner';
  insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
  values (org.id, v_uid, v_role_id, 'active', true, now());

  update public.profiles set default_organization_id = org.id where id = v_uid;

  perform public.log_audit(
    org.id, 'organization.self_registered', 'organization', org.id,
    'Organization self-registered', jsonb_build_object('name', p_name, 'plan', v_plan.key), false
  );

  return org;
end;
$$;

-- Old 9-arg signature (no p_plan_id) is gone — drop it explicitly so the
-- overload doesn't linger and shadow the new one for stale PostgREST caches.
drop function if exists public.register_organization(text, text, text, text, text, text, text, text, text[]);

grant execute on function public.register_organization(text, text, uuid, text, text, text, text, text, text, text[]) to authenticated;

-- 2. Seat-limit enforcement — the spec's own worked example (§11).
create or replace function public.can_add_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select seats from public.subscriptions where organization_id = p_org), 999999)
       > (select count(*) from public.memberships where organization_id = p_org and status = 'active');
$$;

drop policy if exists "memberships_write_admin" on public.memberships;

create policy "memberships_insert" on public.memberships
  for insert with check (
    public.is_org_admin(organization_id)
    and public.can_add_member(organization_id)
  );

create policy "memberships_update" on public.memberships
  for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy "memberships_delete" on public.memberships
  for delete using (public.is_org_admin(organization_id));

-- 3. accept_invitation() gets the identical guard — the second (and only
--    other) path that can create a membership row.
create or replace function public.accept_invitation(p_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
  me_email citext;
  mem public.memberships;
begin
  select email into me_email from public.profiles where id = auth.uid();
  if me_email is null then
    raise exception 'No authenticated profile' using errcode = '42501';
  end if;

  select * into inv from public.invitations where token = p_token;
  if inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer valid' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;
  if lower(inv.email) <> lower(me_email) then
    raise exception 'Invitation was issued to a different email' using errcode = '42501';
  end if;
  if not public.can_add_member(inv.organization_id) then
    raise exception 'Seat limit reached for this organization''s plan' using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (inv.organization_id, auth.uid(), inv.role_id, 'active', inv.invited_by, inv.created_at, now())
  on conflict (organization_id, user_id)
    do update set status = 'active', role_id = excluded.role_id
  returning * into mem;

  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  update public.profiles
    set default_organization_id = coalesce(default_organization_id, inv.organization_id)
    where id = auth.uid();

  perform public.log_audit(inv.organization_id, 'invitation.accepted', 'membership', mem.id,
    'User accepted invitation', jsonb_build_object('email', me_email));

  return mem;
end;
$$;
