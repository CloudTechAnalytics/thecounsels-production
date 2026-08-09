-- ============================================================================
-- Migration 0060 — Communication Hub, Part A: permission catalog.
--
-- Four new permissions for firm-wide channels + direct messages. Granted
-- broadly (view/send/create_channels to every system role) since chat is
-- meant to be available firm-wide, like Slack. Note the leadership
-- cross-join in 0003 only ran once at that migration's original execution —
-- permissions added afterward (0030, 0038, 0039, and now this one) always
-- need their own explicit grant, including for leadership roles.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('messaging.view', 'messaging', 'view', 'View channels and direct messages'),
  ('messaging.send', 'messaging', 'send', 'Send messages in channels and direct messages'),
  ('messaging.create_channels', 'messaging', 'create_channels', 'Create new firm-wide channels'),
  ('messaging.manage_channels', 'messaging', 'manage_channels', 'Rename or archive any channel')
on conflict (key) do nothing;

-- view/send/create_channels: every system role.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('messaging.view', 'messaging.send', 'messaging.create_channels')
  and r.key in (
    'platform_owner', 'platform_admin', 'managing_partner', 'partner',
    'senior_associate', 'associate', 'junior_associate', 'paralegal',
    'finance', 'hr', 'secretary', 'receptionist'
  )
on conflict do nothing;

-- manage_channels (rename/archive *any* channel, not just your own): leadership only.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'messaging.manage_channels'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;
