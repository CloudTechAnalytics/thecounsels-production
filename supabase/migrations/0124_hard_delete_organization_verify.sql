-- ============================================================================
-- Migration 0124 — hard_delete_organization actually verifies the delete.
--
-- Previously: `delete from organizations where id = p_org and deleted_at is
-- not null;` with no row-count check at all. If that WHERE ever matched zero
-- rows — the org's deleted_at got cleared by a concurrent restore while the
-- hard-delete-organization Edge Function was still working through its
-- (slow, sequential) member-account purge, or any other reason the row
-- wasn't there anymore — this silently returned success. No exception, no
-- signal. The caller (the Edge Function, then the UI) had no way to know
-- the organization was never actually removed.
-- ============================================================================

create or replace function public.hard_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;

  delete from public.organizations where id = p_org and deleted_at is not null;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'Organization was not deleted — it may no longer be in Trash (restored, or already removed)'
      using errcode = 'P0001';
  end if;
end;
$function$;
