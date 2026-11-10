-- ============================================================================
-- Migration 0209 — Partners get the same access as the Managing Partner.
--
-- Until now Partner lacked seven permissions the Managing Partner has
-- (payroll, staff advances/expenses, inventory, power, surveys, appraisals,
-- and seeing every matter). John asked for partners to match the MP.
-- A partner limited to one branch still only sees that branch — branch scope
-- is applied separately from these permissions.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select pr.id, rp.permission_id
from public.roles pr
join public.roles mp on mp.key = 'managing_partner'
join public.role_permissions rp on rp.role_id = mp.id
where pr.key = 'partner'
on conflict do nothing;
