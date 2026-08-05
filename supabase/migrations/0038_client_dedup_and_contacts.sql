-- ============================================================================
-- Migration 0038 — Client validation, duplicate detection, multiple contacts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pg_trgm — trigram similarity, the standard Postgres tool for fuzzy text
--    matching. Not enabled anywhere in this project before now.
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 2. client_contacts — replaces the single flat "primary contact" fields
--    added in 0029. A corporate client can now have any number of contacts.
-- ----------------------------------------------------------------------------
create table public.client_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  title           text,
  email           text,
  phone           text,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_client_contacts_client on public.client_contacts (client_id);
-- At most one primary contact per client.
create unique index idx_client_contacts_one_primary on public.client_contacts (client_id) where is_primary;

alter table public.client_contacts enable row level security;

create policy "client_contacts_select" on public.client_contacts
  for select using (public.has_permission(organization_id, 'clients.view'));
create policy "client_contacts_insert" on public.client_contacts
  for insert with check (
    public.has_permission(organization_id, 'clients.update')
    or public.has_permission(organization_id, 'clients.create')
  );
create policy "client_contacts_update" on public.client_contacts
  for update using (public.has_permission(organization_id, 'clients.update'))
  with check (public.has_permission(organization_id, 'clients.update'));
create policy "client_contacts_delete" on public.client_contacts
  for delete using (public.has_permission(organization_id, 'clients.update'));

-- Backfill: every client with a "primary contact" set under the old flat
-- columns gets one client_contacts row carrying that data forward.
insert into public.client_contacts (organization_id, client_id, name, title, email, phone, is_primary)
select organization_id, id, contact_name, contact_title, contact_email, contact_phone, true
from public.clients
where contact_name is not null and trim(contact_name) <> '';

-- The flat columns are now fully superseded — no reason to maintain two
-- parallel contact-storage mechanisms.
alter table public.clients
  drop column if exists contact_name,
  drop column if exists contact_title,
  drop column if exists contact_email,
  drop column if exists contact_phone;

-- ----------------------------------------------------------------------------
-- 3. Registration number — new field, enforced uniqueness per org.
--    Comparison is case/whitespace-insensitive; the stored value keeps
--    whatever casing was typed.
-- ----------------------------------------------------------------------------
alter table public.clients add column if not exists registration_number text;

create unique index if not exists idx_clients_registration_number
  on public.clients (organization_id, lower(trim(registration_number)))
  where registration_number is not null;

-- ----------------------------------------------------------------------------
-- 4. Duplicate detection RPC. Compares against clients.display_name (already
--    the canonical name for both individual and corporate clients) rather
--    than re-deriving type-specific name logic in SQL.
--
--    exact  := normalized display_name equality, OR exact email match,
--              OR exact registration_number match.
--    similar := trigram name similarity >= 0.35 (Postgres's own `%` operator
--               defaults to 0.3; slightly stricter here to cut noise), OR
--               exact phone match — evaluated only when not already exact.
-- ----------------------------------------------------------------------------
create or replace function public.find_similar_clients(
  p_org uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_registration_number text default null,
  p_exclude_id uuid default null
)
returns table (id uuid, display_name text, type public.client_type, match_type text, score real)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.display_name,
    c.type,
    case
      when lower(trim(c.display_name)) = lower(trim(p_name)) then 'exact'
      when p_email is not null and trim(p_email) <> '' and lower(trim(c.email)) = lower(trim(p_email)) then 'exact'
      when p_registration_number is not null and trim(p_registration_number) <> ''
        and lower(trim(c.registration_number)) = lower(trim(p_registration_number)) then 'exact'
      else 'similar'
    end as match_type,
    greatest(
      similarity(lower(trim(c.display_name)), lower(trim(p_name))),
      case when p_phone is not null and trim(p_phone) <> '' and lower(trim(c.phone)) = lower(trim(p_phone))
        then 1.0 else 0.0 end
    ) as score
  from public.clients c
  where c.organization_id = p_org
    and public.has_permission(p_org, 'clients.view')
    and (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      lower(trim(c.display_name)) = lower(trim(p_name))
      or (p_email is not null and trim(p_email) <> '' and lower(trim(c.email)) = lower(trim(p_email)))
      or (p_registration_number is not null and trim(p_registration_number) <> ''
          and lower(trim(c.registration_number)) = lower(trim(p_registration_number)))
      or similarity(lower(trim(c.display_name)), lower(trim(p_name))) >= 0.35
      or (p_phone is not null and trim(p_phone) <> '' and lower(trim(c.phone)) = lower(trim(p_phone)))
    )
  order by (case when lower(trim(c.display_name)) = lower(trim(p_name)) then 0 else 1 end) asc, score desc
  limit 5;
$$;

grant execute on function public.find_similar_clients(uuid, text, text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. clients.create_duplicate — overrides a "similar match" warning only
--    (exact matches are never overridable). Seeded to leadership/platform
--    roles only, matching how clients.delete is already scoped.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('clients.create_duplicate', 'clients', 'create_duplicate', 'Create a client despite a similar-match warning')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create_duplicate'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;
