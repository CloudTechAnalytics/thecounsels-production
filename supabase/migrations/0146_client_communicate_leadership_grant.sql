-- ============================================================================
-- Migration 0146 — Fix a real gap in 0145: has_permission() only
-- short-circuits true for platform_owner/platform_admin (is_platform_admin()),
-- NOT managing_partner/partner — those two need their own role_permissions
-- row for every permission, same as any other role. 0145 only granted
-- clients.communicate to the fee-earner tier (senior/associate/junior
-- associate), which would have left managing_partner and partner unable to
-- send a client communication despite outranking everyone who can — caught
-- before this reached a live test. Matches 0144's exact grant set
-- (platform_owner/platform_admin included too, redundant for has_permission
-- itself but keeps the Roles & Permissions viewer accurate — see 0067's own
-- note on why that matters).
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
  and p.key = 'clients.communicate'
on conflict do nothing;
