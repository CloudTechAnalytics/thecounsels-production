-- ============================================================================
-- Migration 0187 — staff see and edit only their own time and expenses.
--
-- time_entries / expenses were readable by anyone holding billing.view on a
-- matter they could access — and associates hold billing.view — so a senior
-- associate saw a partner's hours, rates and expenses on every shared
-- matter. time_entries writes used the same billing.view test, letting an
-- associate log, edit or delete a colleague's time.
--
-- Now: your own rows always; colleagues' rows only for people who bill and
-- report (invoices.manage / reports.financial — Partners, Managing Partners,
-- Finance), still limited to matters they can access. Expenses keep their
-- existing expenses.manage writers (clerks log disbursements for lawyers).
-- Invoices are unchanged: a lawyer on a matter can still see whether the
-- client has been billed and has paid.
-- ============================================================================

-- Reads -----------------------------------------------------------------------
drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (
    user_id = auth.uid()
    or (
      matter_id is not null and public.has_matter_access(matter_id)
      and (public.has_permission(organization_id, 'invoices.manage') or public.has_permission(organization_id, 'reports.financial'))
    )
    or (matter_id is null and public.has_permission(organization_id, 'reports.financial'))
  );

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (
    user_id = auth.uid()
    or (
      matter_id is not null and public.has_matter_access(matter_id)
      and (
        public.has_permission(organization_id, 'invoices.manage')
        or public.has_permission(organization_id, 'reports.financial')
        or public.has_permission(organization_id, 'expenses.manage')
      )
    )
    or (matter_id is null and public.has_permission(organization_id, 'reports.financial'))
  );

-- Time entry writes: someone else's entry needs invoices.manage -----------------
drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries
  for insert with check (
    ((matter_id is null) or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (user_id = auth.uid() or public.has_permission(organization_id, 'invoices.manage'))
  );

drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries
  for update
  using (
    ((matter_id is null) or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (user_id = auth.uid() or public.has_permission(organization_id, 'invoices.manage'))
    and ((status <> all (array['invoiced'::public.time_entry_status, 'paid'::public.time_entry_status])) or public.is_partner_or_above(organization_id))
  )
  with check (
    ((matter_id is null) or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (user_id = auth.uid() or public.has_permission(organization_id, 'invoices.manage'))
    and ((status <> all (array['invoiced'::public.time_entry_status, 'paid'::public.time_entry_status])) or public.is_partner_or_above(organization_id))
  );

drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_delete on public.time_entries
  for delete using (
    ((matter_id is null) or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (user_id = auth.uid() or public.has_permission(organization_id, 'invoices.manage'))
    and ((status <> all (array['invoiced'::public.time_entry_status, 'paid'::public.time_entry_status])) or public.is_partner_or_above(organization_id))
  );
