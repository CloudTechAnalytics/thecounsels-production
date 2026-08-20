-- ============================================================================
-- Migration 0108 — Organization storage quota: usage, limits, enforcement.
--
-- plans.storage_gb has existed since 0006, editable in the Platform Console,
-- displayed publicly — but never enforced anywhere. organizations.storage_
-- used_bytes has existed since 0006 too but is permanently 0 (nothing ever
-- wrote to it) — 0072 already discovered this while fixing something else
-- and established the precedent this migration follows: compute usage LIVE
-- from the real source of truth (size_bytes columns) rather than a
-- manually-maintained counter, which this codebase has hit drift bugs on
-- twice already this session (seats, next_billing_date).
--
-- Three tables already carry everything needed: documents, expense_receipts,
-- hr_employee_documents — each organization_id-scoped, each with size_bytes.
-- 0072's platform_storage_usage() already does live computation for the
-- Platform Console, but only sums documents — under-reporting real usage.
-- Fixed here too. avatars/org-logos buckets are public/cosmetic, no size
-- tracking exists for them anywhere, excluded (negligible size).
--
-- Enforcement is a `before insert` trigger on all 3 tables — the real,
-- race-safe backstop (can't be bypassed by uploading through a different
-- component). It plugs into the EXISTING compensating-transaction pattern
-- already in documentsService.upload() / billingService.uploadReceipt() /
-- hrService.uploadHrDocument(): all three already storage.remove() the
-- just-uploaded blob on any insert failure — the trigger's exception on
-- insert IS that same "insert failed" case, no changes needed there.
-- ============================================================================

-- 1. Storage tier reprice (user-approved: spec's 4 generic tier names don't
--    match this app's actual 4 plan names — mapped so each tier shifts up
--    proportionally, matching the ascending order in both lists). Basic and
--    Enterprise are unchanged (10GB / 1024GB already match).
update public.plans set storage_gb = 250 where key = 'professional';
update public.plans set storage_gb = 500 where key = 'business';

-- 2. Additional storage add-on — data model only, no purchase flow yet
--    (Paystack has no add-on product to hang it off). Makes
--    `limit = plan.storage_gb + additional_storage_gb` a real, working
--    formula today.
alter table public.subscriptions
  add column additional_storage_gb integer not null default 0
    check (additional_storage_gb >= 0);

-- ----------------------------------------------------------------------------
-- 3. org_storage_usage — live sum across all 3 file tables for one org.
--    security definer: a caller with documents.view but not billing.view or
--    HR document permissions must still get the TRUE total, not a partial
--    sum limited by their own RLS — this is used for enforcement (trigger)
--    and the headline usage figure, both of which must be accurate
--    regardless of the calling user's own permission scope.
-- ----------------------------------------------------------------------------
create or replace function public.org_storage_usage(p_org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_org_member(p_org) then (
    coalesce((select sum(size_bytes) from public.documents where organization_id = p_org), 0)
    + coalesce((select sum(size_bytes) from public.expense_receipts where organization_id = p_org), 0)
    + coalesce((select sum(size_bytes) from public.hr_employee_documents where organization_id = p_org), 0)
  )::bigint else 0 end;
$$;

grant execute on function public.org_storage_usage(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. org_storage_limit_bytes — the org's current plan allowance + add-on.
-- ----------------------------------------------------------------------------
create or replace function public.org_storage_limit_bytes(p_org uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_org_member(p_org) then (
    coalesce((
      select (pl.storage_gb + s.additional_storage_gb)::bigint * 1024 * 1024 * 1024
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      where s.organization_id = p_org
    ), 0)
  ) else 0 end;
$$;

grant execute on function public.org_storage_limit_bytes(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. org_storage_breakdown — 4 real, reliably-calculable categories.
--    security definer for the same reason as org_storage_usage: must sum
--    the TRUE total per category, not one truncated by the viewer's own
--    billing/HR permission scope, or the breakdown wouldn't add up to the
--    headline usage figure.
-- ----------------------------------------------------------------------------
create or replace function public.org_storage_breakdown(p_org uuid)
returns table (category text, bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select 'documents'::text, coalesce(sum(size_bytes), 0)::bigint
    from public.documents where organization_id = p_org and matter_id is null and public.is_org_member(p_org)
  union all
  select 'matter_attachments'::text, coalesce(sum(size_bytes), 0)::bigint
    from public.documents where organization_id = p_org and matter_id is not null and public.is_org_member(p_org)
  union all
  select 'hr_documents'::text, coalesce(sum(size_bytes), 0)::bigint
    from public.hr_employee_documents where organization_id = p_org and public.is_org_member(p_org)
  union all
  select 'expense_receipts'::text, coalesce(sum(size_bytes), 0)::bigint
    from public.expense_receipts where organization_id = p_org and public.is_org_member(p_org);
$$;

grant execute on function public.org_storage_breakdown(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. org_largest_files — top N across all 3 tables, merged. security definer
--    for the same "must not hide the real biggest consumer from an admin
--    with partial permissions" reasoning.
-- ----------------------------------------------------------------------------
create or replace function public.org_largest_files(p_org uuid, p_limit int default 20)
returns table (
  source text,
  id uuid,
  name text,
  size_bytes bigint,
  uploaded_by_name text,
  created_at timestamptz,
  matter_id uuid,
  employee_user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'document'::text, d.id, d.display_name, d.size_bytes, pr.full_name, d.created_at, d.matter_id, null::uuid
    from public.documents d
    left join public.profiles pr on pr.id = d.uploaded_by
    where d.organization_id = p_org and public.is_org_member(p_org)
    union all
    select 'expense_receipt'::text, r.id, r.file_name, r.size_bytes, pr.full_name, r.created_at, null::uuid, null::uuid
    from public.expense_receipts r
    left join public.profiles pr on pr.id = r.uploaded_by
    where r.organization_id = p_org and public.is_org_member(p_org)
    union all
    select 'hr_document'::text, h.id, h.display_name, h.size_bytes, pr.full_name, h.created_at, null::uuid, h.user_id
    from public.hr_employee_documents h
    left join public.profiles pr on pr.id = h.uploaded_by
    where h.organization_id = p_org and public.is_org_member(p_org)
  ) all_files
  order by size_bytes desc nulls last
  limit p_limit;
$$;

grant execute on function public.org_largest_files(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Fix platform_storage_usage() (0072) to cover all 3 tables — it only
--    ever summed documents, silently under-reporting any org with HR
--    documents or expense receipts. Same signature/grant as before.
-- ----------------------------------------------------------------------------
create or replace function public.platform_storage_usage()
returns table (organization_id uuid, total_bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select org_id, sum(bytes)::bigint from (
    select organization_id as org_id, size_bytes as bytes from public.documents where public.is_platform_admin()
    union all
    select organization_id, size_bytes from public.expense_receipts where public.is_platform_admin()
    union all
    select organization_id, size_bytes from public.hr_employee_documents where public.is_platform_admin()
  ) t
  group by org_id;
$$;

-- ----------------------------------------------------------------------------
-- 8. Enforcement trigger — the authoritative backstop. Runs alongside the
--    existing has_permission-gated insert policies on each table, not
--    instead of them. security definer: must see the org's TRUE usage
--    across all 3 tables regardless of the inserting user's own permission
--    scope (a paralegal with documents.upload but not billing.view must
--    still be correctly blocked/allowed based on the real total, not an
--    RLS-truncated one).
--
--    org_storage_usage() runs BEFORE the new row exists, so it does not yet
--    include new.size_bytes — hence `usage + new.size_bytes > limit`, not
--    `usage > limit`. A limit of 0 (no subscription/plan row) is treated as
--    "unconfigured, allow" rather than locking the org out.
--
--    Normal read-committed race tolerance accepted (two simultaneous
--    uploads can both read the same usage and both pass, a small overshoot
--    is possible) — matches the rigor level of every other definer-function
--    check in this codebase; not engineering full serializable isolation.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_org_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
  v_limit bigint;
begin
  v_used := public.org_storage_usage(new.organization_id);
  v_limit := public.org_storage_limit_bytes(new.organization_id);
  if v_limit > 0 and v_used + coalesce(new.size_bytes, 0) > v_limit then
    raise exception 'Storage limit reached. Your organization has used % of % storage allowance. Please delete unused files or upgrade your storage plan.',
      pg_size_pretty(v_used), pg_size_pretty(v_limit)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_storage_quota on public.documents;
create trigger trg_documents_storage_quota
  before insert on public.documents
  for each row execute function public.enforce_org_storage_quota();

drop trigger if exists trg_expense_receipts_storage_quota on public.expense_receipts;
create trigger trg_expense_receipts_storage_quota
  before insert on public.expense_receipts
  for each row execute function public.enforce_org_storage_quota();

drop trigger if exists trg_hr_employee_documents_storage_quota on public.hr_employee_documents;
create trigger trg_hr_employee_documents_storage_quota
  before insert on public.hr_employee_documents
  for each row execute function public.enforce_org_storage_quota();
