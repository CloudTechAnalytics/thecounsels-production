-- ============================================================================
-- Migration 0031 — Fix "Could not save matter" introduced by 0030.
--
-- `.insert().select()` (used by mattersService.create) runs as a single
-- INSERT ... RETURNING statement. Postgres applies the table's SELECT RLS
-- policy to that RETURNING output, and it does so as each row is processed —
-- BEFORE any AFTER ROW trigger for that same statement fires. has_matter_access
-- previously granted a matter's creator access only via the
-- grant_matter_creator_access trigger inserting a matter_assignments row,
-- which hadn't run yet at the moment RETURNING was evaluated. Net effect:
-- creating a matter succeeded at the INSERT, then failed on the immediate
-- read-back — for every user, including org admins in some paths, whenever
-- the row-return timing lost the race.
--
-- Fixed by checking matters.created_by directly inside has_matter_access,
-- with no dependency on trigger timing. The trigger (and the
-- matter_assignments row it writes) stays — it's what makes the creator show
-- up in the "Assigned team" UI — this just makes RLS correct independent of it.
-- ============================================================================

create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matters m
    where m.id = p_matter
      and public.has_permission(m.organization_id, 'matters.view')
      and (
        public.is_org_admin(m.organization_id)
        or public.has_permission(m.organization_id, 'matters.view_all')
        or m.lead_lawyer_id = auth.uid()
        or m.created_by = auth.uid()
        or exists (
          select 1 from public.matter_assignments ma
          where ma.matter_id = m.id and ma.user_id = auth.uid()
        )
      )
  );
$$;
