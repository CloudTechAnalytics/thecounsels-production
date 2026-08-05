-- ============================================================================
-- Migration 0036 — Notify the outgoing lead lawyer, not just the incoming one.
--
-- notify_matter_assigned (0025) only ever notified the NEW lead_lawyer_id.
-- Reassigning a matter's Lead Lawyer field away from someone is a separate
-- code path from removing them via the "Assigned team" list (0035 covers
-- that one) — this was the other half of the same gap, and the actual
-- one being tested: the matter in question always had its lead lawyer set
-- via the Edit Matter form, not the team card, so 0035's trigger never had
-- anything to fire on.
-- ============================================================================

create or replace function public.notify_matter_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  unassigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.lead_lawyer_id is not null;
    unassigned := false;
  else
    assigned := new.lead_lawyer_id is not null and new.lead_lawyer_id is distinct from old.lead_lawyer_id;
    unassigned := old.lead_lawyer_id is not null and old.lead_lawyer_id is distinct from new.lead_lawyer_id;
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();

  if assigned and (auth.uid() is null or new.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, new.lead_lawyer_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' assigned you to ' || new.title, 'info');
  end if;

  if unassigned and (auth.uid() is null or old.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, old.lead_lawyer_id, auth.uid(), 'matters', 'matter.unassigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' removed you as lead lawyer on ' || new.title, 'warning');
  end if;

  return new;
end $$;
