-- ============================================================================
-- Migration 0080 — HR & People Management, Part 6: HR Documents.
--
-- A separate table AND a separate, non-public storage bucket from the
-- legal Documents module (documents / 'documents' bucket) — an HR
-- document (contract, ID, warning letter) must never be reachable through
-- the general Documents page or its RLS, even for someone with
-- documents.view. Only HR roles upload/manage; an employee can only ever
-- see their own.
-- ============================================================================

create table public.hr_employee_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in (
                     'employment_contract', 'identification', 'professional_certificate', 'bar_certificate',
                     'nda', 'policy_acknowledgement', 'performance_review', 'warning_letter',
                     'employment_letter', 'other'
                   )),
  display_name    text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_hr_employee_documents_org_user on public.hr_employee_documents (organization_id, user_id, created_at desc);

alter table public.hr_employee_documents enable row level security;
create policy "hr_employee_documents_select" on public.hr_employee_documents
  for select using (
    public.has_permission(organization_id, 'hr_documents.manage')
    or (user_id = auth.uid() and public.has_permission(organization_id, 'hr_documents.view_own'))
  );
create policy "hr_employee_documents_write" on public.hr_employee_documents
  for all using (public.has_permission(organization_id, 'hr_documents.manage'))
  with check (public.has_permission(organization_id, 'hr_documents.manage'));

insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;

-- Path convention: {organization_id}/{user_id}/{uuid}-{filename} — the
-- same folder-encodes-ownership pattern org-logos (0017) already uses.
create policy "hr_documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'hr-documents'
    and (
      public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage')
      or (
        ((storage.foldername(name))[2])::uuid = auth.uid()
        and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.view_own')
      )
    )
  );
create policy "hr_documents_storage_insert" on storage.objects
  for insert with check (bucket_id = 'hr-documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage'));
create policy "hr_documents_storage_delete" on storage.objects
  for delete using (bucket_id = 'hr-documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage'));
