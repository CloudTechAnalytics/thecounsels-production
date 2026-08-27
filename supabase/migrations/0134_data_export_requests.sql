-- ============================================================================
-- Migration 0134 — Self-serve organization data export.
--
-- Fulfills what the Privacy Policy already promises (Section 12: "receive
-- a copy of your data in a portable format") — previously only possible by
-- someone with direct database access running SQL by hand. generate-data-
-- export (Edge Function) assembles a curated, matter-organized JSON export
-- (not a raw table dump) and uploads it to a private Storage bucket;
-- data_export_requests tracks the async job so the UI can poll it.
--
-- Gated to organization.manage (same permission organization-settings.tsx
-- already uses for admin-only actions on this page) — this touches
-- billing/financial data, not something every member should trigger.
-- ============================================================================

create type public.data_export_status as enum ('pending', 'processing', 'ready', 'failed');

create table public.data_export_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by    uuid references public.profiles(id) on delete set null,
  status          public.data_export_status not null default 'pending',
  file_path       text,
  error           text,
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  expires_at      timestamptz
);
create index idx_data_export_requests_org on public.data_export_requests (organization_id, requested_at desc);

alter table public.data_export_requests enable row level security;

-- Select/insert only — status/file_path/error are only ever written by the
-- Edge Function via its service-role client, which bypasses RLS entirely;
-- no update policy needed (or wanted) for authenticated users.
create policy "data_export_requests_select" on public.data_export_requests
  for select using (public.is_platform_admin() or public.has_permission(organization_id, 'organization.manage'));

create policy "data_export_requests_insert" on public.data_export_requests
  for insert with check (public.has_permission(organization_id, 'organization.manage'));

-- Private bucket — never public. Signed URLs only, generated per-download
-- (see documents.service.ts's own getSignedUrl for the identical pattern).
insert into storage.buckets (id, name, public)
values ('data-exports', 'data-exports', false)
on conflict (id) do nothing;

-- Path convention: data-exports/<organization_id>/<request_id>.json — same
-- storage.foldername() org-scoping pattern as org-logos (0017). Only
-- SELECT for authenticated users; INSERT is service-role-only (the Edge
-- Function), which bypasses this RLS entirely.
create policy "data_exports_select" on storage.objects
  for select using (
    bucket_id = 'data-exports'
    and (
      public.is_platform_admin()
      or public.has_permission(((storage.foldername(name))[1])::uuid, 'organization.manage')
    )
  );
