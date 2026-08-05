-- ============================================================================
-- Migration 0046 — Let Managing Partner (anyone holding invoices.manage,
-- which today is Managing Partner only) delete an invoice of any status, not
-- just Draft — e.g. a mistakenly-generated ₦0 invoice already marked Sent.
--
-- Replaces delete_draft_invoice() with delete_invoice(), which drops the
-- draft-only restriction but keeps every other safeguard: permission +
-- matter-access check, reversal of linked time entries/expenses back to
-- Unbilled, a matter timeline entry, and an audit log entry. Deleting a
-- Sent/Partial/Paid invoice also permanently removes its payment history
-- (invoice_items/payments both cascade via their existing FKs) — the UI
-- surfaces an explicit extra warning for that case.
-- ============================================================================

drop function if exists public.delete_draft_invoice(uuid);

create or replace function public.delete_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if not (public.has_financial_access(inv.organization_id, 'invoices.manage')
          and (inv.matter_id is null or public.has_matter_access(inv.matter_id))) then
    raise exception 'Not authorized to delete this invoice' using errcode = '42501';
  end if;

  update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
    where invoice_id = p_invoice;
  update public.expenses set invoiced = false, invoice_id = null
    where invoice_id = p_invoice;

  if inv.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (inv.organization_id, inv.matter_id, auth.uid(), 'invoice_deleted',
      'Deleted invoice ' || coalesce(inv.invoice_number, '') ||
      case when inv.status <> 'draft' then ' (was ' || inv.status || ')' else '' end);
  end if;

  perform public.log_audit(inv.organization_id, 'invoice.deleted', 'invoice', inv.id,
    'Deleted invoice ' || coalesce(inv.invoice_number, '') || ' (status was ' || inv.status || ')',
    jsonb_build_object('status', inv.status, 'total', inv.total, 'amount_paid', inv.amount_paid));

  delete from public.invoices where id = p_invoice;
end;
$$;

grant execute on function public.delete_invoice(uuid) to authenticated;
