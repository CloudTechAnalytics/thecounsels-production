-- Commercial Model Overhaul, Part A — plan catalog + subscriptions schema.
--
-- Reprices the dormant 3-tier catalog (starter/professional/enterprise from
-- 0006) to the official 4-tier structure, adds the "business" tier, retires
-- the single-plan "early_access" trial model from 0051, and extends
-- subscriptions with the columns a real Paystack integration and a real
-- lifecycle (expired/suspended, scheduled downgrades, trial reminders)
-- need. Existing organizations are never touched destructively — every
-- plan row keeps its existing id, so any subscriptions.plan_id FK stays
-- valid across this migration.

-- 1. Reprice/extend the existing plans, add "business", retire "early_access".
update public.plans set
  price_monthly = 15000, price_yearly = 150000, max_users = 3, trial_duration_days = 30,
  description = 'For solo lawyers and small law firms',
  highlights = array[
    'Up to 3 users', 'Core matter management', 'Client management', 'Contacts', 'Documents',
    'Hearings & Calendar', 'Tasks', 'Email notifications', 'Time tracking', 'Expenses',
    'Basic billing & invoicing', 'Basic reports'
  ],
  sort_order = 10
where key = 'starter';

update public.plans set
  price_monthly = 50000, price_yearly = 500000, max_users = 10, trial_duration_days = 30,
  description = 'For growing and established law firms',
  highlights = array[
    'Up to 10 users', 'Everything in Starter', 'Advanced task management', 'Advanced notifications',
    'Email + WhatsApp reminders', 'Advanced billing', 'Advanced reports',
    'Increased document storage', 'Priority support'
  ],
  sort_order = 20
where key = 'professional';

insert into public.plans (key, name, description, price_monthly, price_yearly, max_users, storage_gb, trial_duration_days, highlights, sort_order)
values (
  'business', 'Business', 'For larger law firms', 100000, 1000000, 25, 250, 30,
  array[
    'Up to 25 users', 'Everything in Professional', 'Advanced analytics', 'Workflow automation',
    'More storage', 'Advanced firm controls', 'Priority support'
  ],
  25
)
on conflict (key) do update set
  price_monthly = excluded.price_monthly, max_users = excluded.max_users, highlights = excluded.highlights;

-- Enterprise is deliberately "starting from" — is_custom=true is what the UI
-- keys off to render "Custom pricing" instead of a fixed amount and to route
-- to "Contact sales" instead of Paystack checkout. price_monthly stays as
-- the honest floor, never presented as a hard price.
update public.plans set
  name = 'Enterprise', price_monthly = 150000, price_yearly = 1500000, max_users = null,
  is_custom = true, trial_duration_days = 30,
  description = 'Custom pricing for larger or custom firms',
  highlights = array[
    'Custom number of users', 'Custom storage', 'Custom features & workflows',
    'Custom integrations', 'Custom support requirements'
  ],
  sort_order = 30
where key = 'enterprise';

-- The old single-plan self-service trial model is retired, not deleted —
-- any existing org's subscription.plan_id referencing it stays valid.
update public.plans set is_active = false where key = 'early_access';

-- 2. paystack_plan_code — Platform Admin populates this once real Paystack
--    Plan objects exist on their dashboard; null means "not configured yet".
alter table public.plans add column paystack_plan_code text;

-- 3. subscriptions — Paystack + lifecycle columns.
alter table public.subscriptions
  add column paystack_customer_code text,
  add column paystack_subscription_code text,
  add column paystack_transaction_reference text,
  add column amount numeric(12, 2),
  add column currency text not null default 'NGN',
  add column cancellation_reason text,
  add column next_billing_date timestamptz,
  add column scheduled_plan_id uuid references public.plans(id),
  add column scheduled_change_at timestamptz,
  add column last_trial_reminder_days integer;

-- 4. New lifecycle statuses — additive only, existing values untouched.
--    Not referenced anywhere else in this migration (Postgres forbids using
--    a just-added enum value within the same transaction it was added in).
alter type public.subscription_status add value if not exists 'expired';
alter type public.subscription_status add value if not exists 'suspended';

-- 5. registration_settings — 30-day default (was 90), still Platform-
--    Console-configurable. trial_plan_id/trial_future_price are no longer
--    read (self-service registration becomes plan-choice-driven in the next
--    migration) — left in place rather than dropped, harmless.
update public.registration_settings set trial_duration_days = 30 where id = true;

-- 6. create_organization() — the Platform Admin manual-creation RPC (kept
--    fully intact otherwise) had two stale defaults: it always fell back to
--    'professional' when no plan was chosen, and always granted a flat
--    14-day trial regardless of which plan that resolved to. Both now
--    follow the new catalog: 'starter' is the entry-tier default, and trial
--    length comes from the resolved plan's own trial_duration_days.
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle public.billing_cycle default 'monthly',
  p_owner_user_id uuid default null,
  p_org_type text default 'customer'
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
  owner_role_id uuid;
  resolved_plan_id uuid;
  resolved_trial_days integer;
  period_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations' using errcode = '42501';
  end if;
  if p_org_type not in ('customer', 'demo', 'internal') then
    raise exception 'Invalid organization type: %', p_org_type;
  end if;

  insert into public.organizations (name, slug, legal_name, status, organization_type)
  values (
    p_name,
    lower(p_slug),
    p_legal_name,
    (case when p_org_type <> 'customer' then 'active' when p_trial then 'trial' else 'active' end)::public.org_status,
    p_org_type
  )
  returning * into org;

  if p_org_type = 'customer' then
    resolved_plan_id := coalesce(p_plan_id, (select id from public.plans where key = 'starter'));

    if p_trial then
      resolved_trial_days := coalesce((select trial_duration_days from public.plans where id = resolved_plan_id), 30);
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
      values (
        org.id, resolved_plan_id, 'trialing', p_billing_cycle,
        coalesce((select max_users from public.plans where id = resolved_plan_id), 5),
        now() + (resolved_trial_days || ' days')::interval,
        now() + (resolved_trial_days || ' days')::interval
      );
    else
      period_end := case when p_billing_cycle = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end;
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, current_period_end, next_billing_date)
      values (org.id, resolved_plan_id, 'active', p_billing_cycle,
              coalesce((select max_users from public.plans where id = resolved_plan_id), 5), period_end, period_end);
    end if;
  end if;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial, 'org_type', p_org_type), true);
  return org;
end;
$$;
