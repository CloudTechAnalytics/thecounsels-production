-- ============================================================================
-- Migration 0190 — personal e-signatures and firm document templates.
--
-- user_signatures: one drawn or uploaded signature per person, kept as a
--   small PNG/JPEG data URL so generated documents (receipts, invoices, fund
--   vouchers, letters) can place it without a storage round-trip. Only the
--   owner can set it; colleagues in a shared firm can read it, because a
--   receipt one person recorded is printed by another.
-- document_templates: the firm's letter/document library with {{placeholders}}
--   filled from client, matter, firm and signer at generation time.
-- ============================================================================

create table if not exists public.user_signatures (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  image      text not null check (image like 'data:image/%' and length(image) <= 400000),
  updated_at timestamptz not null default now()
);
alter table public.user_signatures enable row level security;

drop policy if exists user_signatures_select on public.user_signatures;
create policy user_signatures_select on public.user_signatures
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.memberships me
      join public.memberships them on them.organization_id = me.organization_id
      where me.user_id = auth.uid() and me.status = 'active'
        and them.user_id = user_signatures.user_id and them.status = 'active'
    )
  );
drop policy if exists user_signatures_write on public.user_signatures;
create policy user_signatures_write on public.user_signatures
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.document_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 160),
  category        text,
  description     text,
  body            text not null default '',
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_document_templates_org on public.document_templates (organization_id, name);
alter table public.document_templates enable row level security;

drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
  for select using (public.has_permission(organization_id, 'documents.view'));
drop policy if exists document_templates_write on public.document_templates;
create policy document_templates_write on public.document_templates
  for all using (public.has_permission(organization_id, 'documents.manage') or public.is_org_admin(organization_id))
  with check (public.has_permission(organization_id, 'documents.manage') or public.is_org_admin(organization_id));

create or replace function public.touch_document_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists trg_touch_document_template on public.document_templates;
create trigger trg_touch_document_template
  before update on public.document_templates
  for each row execute function public.touch_document_template();

create or replace function public.audit_document_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.document_templates := coalesce(new, old);
begin
  perform public.log_audit(t.organization_id,
    case tg_op when 'INSERT' then 'document_template.created' when 'UPDATE' then 'document_template.updated' else 'document_template.deleted' end,
    'document_template', t.id,
    case tg_op when 'INSERT' then 'Created template "' when 'UPDATE' then 'Edited template "' else 'Deleted template "' end || t.name || '"',
    '{}'::jsonb);
  return null;
end;
$$;
drop trigger if exists trg_audit_document_template on public.document_templates;
create trigger trg_audit_document_template
  after insert or update or delete on public.document_templates
  for each row execute function public.audit_document_template();
