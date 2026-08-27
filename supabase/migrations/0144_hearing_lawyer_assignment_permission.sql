-- ============================================================================
-- Migration 0144 — Only someone with real authority over a hearing can
-- reassign its Assigned Lawyer or manage its Supporting Lawyers — not
-- anyone holding the broad hearings.update (which includes support staff:
-- Paralegal, Secretary, Litigation Clerk), and not a supporting lawyer
-- removing themselves unilaterally.
--
-- Confirmed with the user: who covers a court appearance is a resourcing
-- decision, not something the covering lawyer unmakes on their own — if
-- they can silently drop off, nobody finds out until the empty chair.
--
-- New hearings.assign permission (mirrors tasks.assign exactly — same
-- fee-earner/leadership tier: senior/associate/junior associate, partner,
-- managing partner, platform staff). Authorized to manage a given
-- hearing's lawyer assignments: hearings.assign holders, the matter's own
-- Lead Lawyer, the matter's Responsible Partner, or (for reassigning the
-- Assigned Lawyer specifically) that hearing's own currently-assigned
-- lawyer handing it off. A plain supporting lawyer is none of those —
-- they can't add/remove supporting lawyers, and can't reassign who's the
-- Assigned Lawyer either.
-- ============================================================================

insert into public.permissions (key, resource, action, description)
values ('hearings.assign', 'hearings', 'assign', 'Assign lawyers to hearings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner', 'senior_associate', 'associate', 'junior_associate')
  and p.key = 'hearings.assign'
on conflict do nothing;

-- Supporting lawyers — narrow from hearings.update to the authority tier
-- above. The matter-access/branch/open-matter condition is unchanged;
-- only which permission satisfies the check has narrowed.
drop policy if exists "hearing_supporting_lawyers_write" on public.hearing_supporting_lawyers;
create policy "hearing_supporting_lawyers_write" on public.hearing_supporting_lawyers
  for all using (
    exists (
      select 1 from public.hearings h
      left join public.matters m on m.id = h.matter_id
      where h.id = hearing_id
        and (
          public.has_permission(h.organization_id, 'hearings.assign')
          or (m.lead_lawyer_id is not null and m.lead_lawyer_id = auth.uid())
          or (m.responsible_partner_id is not null and m.responsible_partner_id = auth.uid())
        )
        and (
          ((h.matter_id is not null) and has_matter_access(h.matter_id) and matter_is_open(h.matter_id))
          or ((h.matter_id is null) and ((h.branch_id is null) or user_has_branch_access(h.organization_id, h.branch_id)))
        )
    )
  )
  with check (
    exists (
      select 1 from public.hearings h
      left join public.matters m on m.id = h.matter_id
      where h.id = hearing_id
        and (
          public.has_permission(h.organization_id, 'hearings.assign')
          or (m.lead_lawyer_id is not null and m.lead_lawyer_id = auth.uid())
          or (m.responsible_partner_id is not null and m.responsible_partner_id = auth.uid())
        )
        and (
          ((h.matter_id is not null) and has_matter_access(h.matter_id) and matter_is_open(h.matter_id))
          or ((h.matter_id is null) and ((h.branch_id is null) or user_has_branch_access(h.organization_id, h.branch_id)))
        )
    )
  );

-- Reassigning the Assigned Lawyer field itself (via the main hearing edit
-- form) gets the same authority check — otherwise the same gap just
-- moves from the supporting-lawyer list to this one field instead of
-- actually closing. The currently-assigned lawyer can still hand it off
-- themselves (they're the one who knows they can't make it); nobody else
-- outside the authority tier can reassign it out from under them.
create or replace function public.guard_hearing_lawyer_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_partner uuid;
begin
  if new.assigned_lawyer_id is distinct from old.assigned_lawyer_id then
    if new.matter_id is not null then
      select lead_lawyer_id, responsible_partner_id into v_lead, v_partner from public.matters where id = new.matter_id;
    end if;
    if not (
      public.has_permission(new.organization_id, 'hearings.assign')
      or (v_lead is not null and v_lead = auth.uid())
      or (v_partner is not null and v_partner = auth.uid())
      or (old.assigned_lawyer_id is not null and old.assigned_lawyer_id = auth.uid())
    ) then
      raise exception 'You do not have permission to reassign this hearing''s Assigned Lawyer' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_hearing_lawyer_assignment on public.hearings;
create trigger trg_guard_hearing_lawyer_assignment
  before update on public.hearings
  for each row execute function public.guard_hearing_lawyer_assignment();
