-- ============================================================================
-- Migration 0160 — Real reported bug: assigning someone as Responsible
-- Partner on a matter gave them no actual access to it at all, and no
-- notification either. matter_row_access() — the function every matters_*
-- RLS policy and has_matter_access() (in turn used by hearings, tasks,
-- documents, client_communications, matter_ai_chat_messages and more) is
-- built on — only ever checked lead_lawyer_id, created_by, and
-- matter_assignments membership. responsible_partner_id was never wired
-- into it at all, despite being a real column with a real form field.
-- Fixing this one function fixes access across every one of those
-- dependent tables at once, not just the matters table itself.
--
-- Also extends notify_matter_assigned() (previously lead_lawyer_id only)
-- to notify the responsible partner too, symmetric to how it already
-- treats the lead lawyer.
-- ============================================================================

-- The three matters_* policies below depend on the old signature directly
-- (RLS policies count as real dependents) — drop them first or the
-- function drop itself fails.
drop policy if exists matters_select on public.matters;
drop policy if exists matters_update on public.matters;
drop policy if exists matters_delete on public.matters;

-- New parameter changes the argument list, which Postgres treats as a
-- distinct overload rather than a true replace (same gotcha as 0054/0154)
-- — drop the old 5-arg signature explicitly so every caller resolves to
-- the one below, not a stale duplicate.
drop function if exists public.matter_row_access(uuid, uuid, uuid, uuid, uuid);

create function public.matter_row_access(
  p_org uuid,
  p_lead_lawyer uuid,
  p_created_by uuid,
  p_matter uuid,
  p_branch_id uuid,
  p_responsible_partner uuid default null
)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_owner(p_org)
      or public.has_permission(p_org, 'matters.view_all')
      or (
        (
          p_lead_lawyer = auth.uid()
          or p_responsible_partner = auth.uid()
          or p_created_by = auth.uid()
          or exists (select 1 from public.matter_assignments ma where ma.matter_id = p_matter and ma.user_id = auth.uid())
        )
        and (
          public.user_has_branch_access(p_org, p_branch_id)
          or exists (
            select 1 from public.matter_branch_shares mbs
            where mbs.matter_id = p_matter and public.user_has_branch_access(p_org, mbs.branch_id)
          )
        )
      )
    );
$$;

create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.matters m
    where m.id = p_matter
      and public.matter_row_access(m.organization_id, m.lead_lawyer_id, m.created_by, m.id, m.branch_id, m.responsible_partner_id)
  );
$$;

drop policy if exists matters_select on public.matters;
create policy matters_select on public.matters
for select
using (matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id, responsible_partner_id));

drop policy if exists matters_update on public.matters;
create policy matters_update on public.matters
for update
using (
  has_permission(organization_id, 'matters.update')
  and matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id, responsible_partner_id)
  and status <> all (array['closed'::matter_status, 'won'::matter_status, 'lost'::matter_status])
);

drop policy if exists matters_delete on public.matters;
create policy matters_delete on public.matters
for delete
using (
  has_permission(organization_id, 'matters.delete')
  and matter_row_access(organization_id, lead_lawyer_id, created_by, id, branch_id, responsible_partner_id)
);

-- Symmetric with the lead-lawyer half already there — same "only notify
-- when it's a genuine change, and not notifying yourself" guards.
create or replace function public.notify_matter_assigned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor_name text;
  lead_assigned boolean;
  lead_unassigned boolean;
  partner_assigned boolean;
  partner_unassigned boolean;
begin
  if tg_op = 'INSERT' then
    lead_assigned := new.lead_lawyer_id is not null;
    lead_unassigned := false;
    partner_assigned := new.responsible_partner_id is not null;
    partner_unassigned := false;
  else
    lead_assigned := new.lead_lawyer_id is not null and new.lead_lawyer_id is distinct from old.lead_lawyer_id;
    lead_unassigned := old.lead_lawyer_id is not null and old.lead_lawyer_id is distinct from new.lead_lawyer_id;
    partner_assigned := new.responsible_partner_id is not null and new.responsible_partner_id is distinct from old.responsible_partner_id;
    partner_unassigned := old.responsible_partner_id is not null and old.responsible_partner_id is distinct from new.responsible_partner_id;
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();

  if lead_assigned and (auth.uid() is null or new.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, new.lead_lawyer_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' assigned you to ' || new.title, 'info');
  end if;

  if lead_unassigned and (auth.uid() is null or old.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, old.lead_lawyer_id, auth.uid(), 'matters', 'matter.unassigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' removed you as lead lawyer on ' || new.title, 'warning');
  end if;

  if partner_assigned and (auth.uid() is null or new.responsible_partner_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, new.responsible_partner_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' made you responsible partner on ' || new.title, 'info');
  end if;

  if partner_unassigned and (auth.uid() is null or old.responsible_partner_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, old.responsible_partner_id, auth.uid(), 'matters', 'matter.unassigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' removed you as responsible partner on ' || new.title, 'warning');
  end if;

  return new;
end;
$$;

-- The trigger itself was scoped to "UPDATE OF lead_lawyer_id" — an update
-- that only touched responsible_partner_id would never have fired this at
-- all, function body fix above notwithstanding.
drop trigger if exists trg_notify_matter_assigned on public.matters;
create trigger trg_notify_matter_assigned
  after insert or update of lead_lawyer_id, responsible_partner_id on public.matters
  for each row execute function public.notify_matter_assigned();
