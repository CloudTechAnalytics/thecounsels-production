-- ============================================================================
-- Migration 0024 — Time entries overhaul: workflow status, audit trail, and a
-- rank-based lock/reopen mechanism.
--
-- Status coexists with the existing invoiced/invoice_id columns rather than
-- replacing them — generate_invoice() is untouched and keeps setting those
-- exactly as before; two triggers bridge the new status to that mechanism.
-- ============================================================================

create type public.time_entry_status as enum ('draft', 'submitted', 'approved', 'invoiced', 'paid');

alter table public.time_entries
  add column if not exists status public.time_entry_status not null default 'draft',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- Backfill: legacy rows were real, invoice-eligible entries, not drafts.
update public.time_entries set status = 'approved' where status = 'draft' and not invoiced;
update public.time_entries set status = 'invoiced' where invoiced;
update public.time_entries t
  set status = 'paid'
  from public.invoices i
  where t.invoice_id = i.id and t.status = 'invoiced' and i.status = 'paid';

update public.time_entries set created_by = user_id, updated_by = user_id where created_by is null;

create index if not exists idx_time_entries_status on public.time_entries (organization_id, status);
create index if not exists idx_time_entries_org_date on public.time_entries (organization_id, work_date);

-- ----------------------------------------------------------------------------
-- Keep status in sync with the existing invoiced/paid mechanisms.
-- ----------------------------------------------------------------------------
create or replace function public.sync_time_entry_status_on_invoiced()
returns trigger language plpgsql as $$
begin
  if new.invoiced and not old.invoiced then
    new.status := 'invoiced';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_time_entry_status on public.time_entries;
create trigger trg_sync_time_entry_status
  before update on public.time_entries
  for each row execute function public.sync_time_entry_status_on_invoiced();

create or replace function public.cascade_invoice_status_to_time_entries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.time_entries set status = 'paid' where invoice_id = new.id and status = 'invoiced';
  elsif old.status = 'paid' and new.status is distinct from 'paid' then
    update public.time_entries set status = 'invoiced' where invoice_id = new.id and status = 'paid';
  end if;
  return new;
end $$;

drop trigger if exists trg_cascade_invoice_status_to_time_entries on public.invoices;
create trigger trg_cascade_invoice_status_to_time_entries
  after update of status on public.invoices
  for each row execute function public.cascade_invoice_status_to_time_entries();

-- ----------------------------------------------------------------------------
-- Audit: created_by/updated_by, trusted server-side (not from client input).
-- ----------------------------------------------------------------------------
create or replace function public.track_time_entry_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_by := coalesce(new.updated_by, new.created_by);
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_time_entries_actor on public.time_entries;
create trigger trg_time_entries_actor
  before insert or update on public.time_entries
  for each row execute function public.track_time_entry_actor();

-- ----------------------------------------------------------------------------
-- Rank-based "Partner or above" helper — no rank-based authorization exists
-- anywhere yet; everything else in this schema is permission-key-based.
-- ----------------------------------------------------------------------------
create or replace function public.member_rank(org uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select r.rank
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.organization_id = org and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_partner_or_above(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_platform_admin() or coalesce(public.member_rank(org) <= 20, false);
$$;

grant execute on function public.member_rank(uuid) to authenticated;
grant execute on function public.is_partner_or_above(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: split the single "for all" write policy so the lock only constrains
-- update/delete (a brand-new row is never locked), and only Partner-or-above
-- can touch an invoiced/paid row.
-- ----------------------------------------------------------------------------
drop policy if exists "time_entries_write" on public.time_entries;

create policy "time_entries_insert" on public.time_entries
  for insert
  with check (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid());

create policy "time_entries_update" on public.time_entries
  for update
  using (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

create policy "time_entries_delete" on public.time_entries
  for delete
  using (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );
