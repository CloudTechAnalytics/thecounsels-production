-- ============================================================================
-- Migration 0027 — Simplify hard_delete_organization.
--
-- 0008 had this function reach into auth.users with a raw DELETE to clean up
-- login accounts that existed only for the deleted firm. auth.users is owned
-- by Supabase's supabase_auth_admin, not the role migrations run as — that
-- raw DELETE is exactly why "Delete forever" failed for any organization
-- that still had members (an empty org hit 0 rows there and happily
-- succeeded, masking the bug). Account cleanup now happens via the Auth
-- Admin API from the hard-delete-organization Edge Function *before* this
-- runs. This RPC goes back to doing one thing it actually has the
-- privileges for: remove the (already-trashed) organization row, cascading
-- through every org-scoped table exactly as before.
-- ============================================================================
create or replace function public.hard_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;
  delete from public.organizations where id = p_org and deleted_at is not null;
end;
$$;

grant execute on function public.hard_delete_organization(uuid) to authenticated;
