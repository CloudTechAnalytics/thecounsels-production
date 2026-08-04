-- Force a password change on next login for accounts seated with a
-- temporary password (admin-create-user sets this true for freshly created
-- accounts; it's cleared the moment the user successfully sets their own
-- password, via the forced change screen or a normal recovery reset).
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
