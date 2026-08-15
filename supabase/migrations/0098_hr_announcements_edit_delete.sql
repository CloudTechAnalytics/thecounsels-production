-- ============================================================================
-- Migration 0097 — let anyone who can send an HR announcement edit or
-- delete one too. hr_announcements only ever had a SELECT policy (0083) —
-- send_hr_announcement() was deliberately the only way a row got created,
-- but nothing was ever added for update/delete, so an announcement was
-- permanent once sent, with no way to fix a typo or pull a mistaken one.
--
-- Gated on hr_announcements.manage (the same permission that gates
-- sending), not restricted to the original sender — matches how every
-- other HR "manage" permission in this app works (any leave.manage holder
-- can review any leave request, not just ones addressed to them).
--
-- Deliberately not touching audience/recipients on update — notifications
-- were already fanned out to the original audience at send time, so
-- changing who it's addressed to after the fact wouldn't retroactively
-- notify/un-notify anyone. The frontend only exposes title/body for
-- editing; this policy allows more, but that's a client-side choice, not
-- a security boundary that needs enforcing here.
-- ============================================================================

create policy "hr_announcements_update" on public.hr_announcements
  for update
  using (public.has_permission(organization_id, 'hr_announcements.manage'))
  with check (public.has_permission(organization_id, 'hr_announcements.manage'));

create policy "hr_announcements_delete" on public.hr_announcements
  for delete using (public.has_permission(organization_id, 'hr_announcements.manage'));
