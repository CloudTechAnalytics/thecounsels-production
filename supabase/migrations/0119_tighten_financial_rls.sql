-- ============================================================================
-- Migration 0119 — Close the firm-wide financial visibility gap in RLS.
--
-- The UI has always gated firm-wide money (Billing page KPIs, Reports
-- Financial tab, per-client/per-lawyer $ columns) behind `reports.financial`
-- — held only by managing_partner/partner/finance — while every other
-- fee-earner role (senior_associate/associate/junior_associate/paralegal/
-- litigation_clerk) gets `billing.view` for a narrower, intended purpose:
-- seeing the billing rollup on a MATTER they're actually on (Matter Summary
-- card's Professional fees/Unbilled work/Invoices block) and their own
-- unbilled work.
--
-- RLS never enforced that narrower scope. `time_entries_select` and
-- `expenses_select` (0030) grant a `billing.view` holder every row in the
-- org, not just rows tied to a matter they can access — so the unfiltered
-- Billing page "Time entries"/"Expenses" tabs (billing-page.tsx, no
-- matter/user filter, relies entirely on RLS) currently hand any fee-earner
-- every colleague's logged time and expense entries firm-wide, general
-- (non-matter) ones included. `invoices_select`/`invoice_items_select`/
-- `payments_select` (0045) have the same shape: any `billing.view` holder
-- can read every invoice/payment in the org directly (e.g. via the REST
-- API), not just ones tied to a matter they're on.
--
-- Fix, without breaking the legitimate matter-scoped use case: a row tied
-- to a matter (matter_id is not null) stays visible to a `billing.view`
-- holder who has access to THAT matter (has_matter_access — already
-- branch-aware per 0114/matter_branch_shares) — this is exactly what Matter
-- Summary needs and keeps working unchanged. A row with no matter (general/
-- firm-wide financial records, and client-wide invoices spanning multiple
-- matters) now requires `reports.financial` to see, same bar the UI already
-- uses for firm-wide money. Every user still always sees their own
-- time_entries/expenses rows (user_id = auth.uid()) regardless of the above.
--
-- Nothing here touches INSERT/UPDATE/DELETE policies (a `billing.view`
-- holder's write access was already narrower — time_entries/expenses writes
-- are gated the same way today, and invoices/invoice_items/payments writes
-- already require invoices.manage/payments.manage, never held by a plain
-- fee-earner). This migration is SELECT-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. time_entries — supersedes 0030's select policy.
-- ----------------------------------------------------------------------------
drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries
  for select using (
    user_id = auth.uid()
    or (
      matter_id is not null
      and public.has_matter_access(matter_id)
      and public.has_permission(organization_id, 'billing.view')
    )
    or (
      matter_id is null
      and public.has_permission(organization_id, 'reports.financial')
    )
  );

-- ----------------------------------------------------------------------------
-- 2. expenses — supersedes 0030's select policy.
-- ----------------------------------------------------------------------------
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses
  for select using (
    user_id = auth.uid()
    or (
      matter_id is not null
      and public.has_matter_access(matter_id)
      and public.has_permission(organization_id, 'billing.view')
    )
    or (
      matter_id is null
      and public.has_permission(organization_id, 'reports.financial')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. invoices — supersedes 0045's select policy.
-- ----------------------------------------------------------------------------
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    (
      matter_id is not null
      and public.has_matter_access(matter_id)
      and public.has_financial_access(organization_id, 'billing.view')
    )
    or (
      matter_id is null
      and public.has_financial_access(organization_id, 'reports.financial')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. invoice_items — supersedes 0045's select policy.
-- ----------------------------------------------------------------------------
drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          (
            i.matter_id is not null
            and public.has_matter_access(i.matter_id)
            and public.has_financial_access(organization_id, 'billing.view')
          )
          or (
            i.matter_id is null
            and public.has_financial_access(organization_id, 'reports.financial')
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. payments — supersedes 0045's select policy.
-- ----------------------------------------------------------------------------
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          (
            i.matter_id is not null
            and public.has_matter_access(i.matter_id)
            and public.has_financial_access(organization_id, 'billing.view')
          )
          or (
            i.matter_id is null
            and public.has_financial_access(organization_id, 'reports.financial')
          )
        )
    )
  );
