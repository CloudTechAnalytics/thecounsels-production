-- ============================================================================
-- Migration 0208 — New system role: Firm Administrator.
--
-- Someone who runs the system for the firm with the SAME access as the
-- Managing Partner (every permission), without being a partner:
--   * they are not offered as a matter's partner,
--   * they are not part of the "Partner approval" step on staff advances
--     (that step names the managing_partner and partner roles), and
--   * the onboarding checklist still asks the firm to invite its real
--     Managing Partner.
-- Maker-checker still applies: nobody approves their own request.
--
-- Kept in lock-step with the Managing Partner: whenever a permission is
-- granted to (or taken from) the Managing Partner role — as every new module
-- migration does — the same happens to the Firm Administrator via a trigger,
-- so this role never falls behind.
-- ============================================================================

insert into public.roles (key, name, description, rank, is_system)
values ('firm_administrator', 'Firm Administrator',
        'Runs the system for the firm — same access as the Managing Partner, without being a partner', 12, true)
on conflict (key) do update set name = excluded.name, description = excluded.description, rank = excluded.rank;

-- Everything the Managing Partner has today.
insert into public.role_permissions (role_id, permission_id)
select fa.id, rp.permission_id
from public.roles fa
join public.roles mp on mp.key = 'managing_partner'
join public.role_permissions rp on rp.role_id = mp.id
where fa.key = 'firm_administrator'
on conflict do nothing;

-- …and everything granted to (or removed from) the Managing Partner from now on.
create or replace function public.mirror_managing_partner_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mp uuid := (select id from public.roles where key = 'managing_partner');
  v_fa uuid := (select id from public.roles where key = 'firm_administrator');
begin
  if v_mp is null or v_fa is null then return null; end if;
  if tg_op = 'INSERT' and new.role_id = v_mp then
    insert into public.role_permissions (role_id, permission_id) values (v_fa, new.permission_id) on conflict do nothing;
  elsif tg_op = 'DELETE' and old.role_id = v_mp then
    delete from public.role_permissions where role_id = v_fa and permission_id = old.permission_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.mirror_managing_partner_permissions() from public, anon, authenticated;

drop trigger if exists trg_mirror_managing_partner_permissions on public.role_permissions;
create trigger trg_mirror_managing_partner_permissions
  after insert or delete on public.role_permissions
  for each row execute function public.mirror_managing_partner_permissions();
