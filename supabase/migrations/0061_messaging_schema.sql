-- ============================================================================
-- Migration 0061 — Communication Hub, Part B: schema, RLS, triggers,
-- realtime, and a small notification hook for direct messages.
--
-- Firm-wide channels (open to every member with messaging.view — no
-- per-channel ACL/join-table in v1) + 1:1 direct messages. Two separate
-- message tables rather than one polymorphic table, matching this
-- codebase's existing preference for concrete per-domain tables and
-- keeping RLS policies simple. Precedents reused: matter_assignments
-- (0030) for the join-table shape, support_ticket_messages (0019) for the
-- "bump parent on new message" trigger, notifications/matter_events
-- (0025/0022) for the Realtime publication pattern.
-- ============================================================================

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_channels_org on public.channels (organization_id);

create table public.channel_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id      uuid not null references public.channels(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_channel_messages_channel on public.channel_messages (channel_id, created_at desc);

-- One row per (channel, user) once they've viewed it; absence = "everything unread".
create table public.channel_reads (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- Exactly 2 participants, so read-state lives as two columns rather than a
-- generic membership table (no group DMs in v1). user_a/user_b are kept in
-- a normalized order (least/greatest) by get_or_create_dm_conversation()
-- below, which is the only way a row here is ever created.
create table public.direct_conversations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_a              uuid not null references public.profiles(id) on delete cascade,
  user_b              uuid not null references public.profiles(id) on delete cascade,
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  -- Strict ordering (not just <>) so (a,b) and (b,a) can never both exist as
  -- separate rows — get_or_create_dm_conversation() always normalizes via
  -- least()/greatest() before insert, this is the DB-level backstop.
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index idx_direct_conversations_org on public.direct_conversations (organization_id);

create table public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_direct_messages_conversation on public.direct_messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

-- The only way a direct_conversations row is created — normalizes the pair
-- order and validates both users are specifically active members of p_org
-- (not just shares_organization's looser "share *some* org" check, which
-- isn't precise enough once a user can belong to more than one firm — a DM
-- must be scoped to the exact org it's tagged with).
create or replace function public.get_or_create_dm_conversation(p_org uuid, p_other uuid)
returns public.direct_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  rec public.direct_conversations;
begin
  if auth.uid() is null or p_other is null or p_other = auth.uid() then
    raise exception 'Invalid conversation participants';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'You are not a member of this organization';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_other and m.organization_id = p_org and m.status = 'active'
  ) then
    raise exception 'That person is not a member of this organization';
  end if;

  a := least(auth.uid(), p_other);
  b := greatest(auth.uid(), p_other);

  select * into rec from public.direct_conversations where user_a = a and user_b = b;
  if rec.id is not null then
    return rec;
  end if;

  insert into public.direct_conversations (organization_id, user_a, user_b)
  values (p_org, a, b)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.get_or_create_dm_conversation(uuid, uuid) to authenticated;

create or replace function public.mark_channel_read(p_channel uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;

grant execute on function public.mark_channel_read(uuid) to authenticated;

-- Updates only whichever side matches the caller — never lets a user touch
-- the other participant's read-state (hence no direct UPDATE policy on
-- direct_conversations at all).
create or replace function public.mark_dm_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_conversations
  set user_a_last_read_at = case when user_a = auth.uid() then now() else user_a_last_read_at end,
      user_b_last_read_at = case when user_b = auth.uid() then now() else user_b_last_read_at end
  where id = p_conversation and auth.uid() in (user_a, user_b);
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- Powers the sidebar unread badge: unread channel messages (across every
-- channel) + unread DMs (across every conversation), excluding your own
-- messages, for the given org.
create or replace function public.get_unread_message_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select count(*)
      from public.channel_messages cm
      left join public.channel_reads cr on cr.channel_id = cm.channel_id and cr.user_id = auth.uid()
      where cm.organization_id = p_org
        and cm.deleted_at is null
        and cm.author_id is distinct from auth.uid()
        and cm.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
    ), 0)
    +
    coalesce((
      select count(*)
      from public.direct_messages dm
      join public.direct_conversations dc on dc.id = dm.conversation_id
      where dc.organization_id = p_org
        and dm.deleted_at is null
        and dm.author_id is distinct from auth.uid()
        and (
          (dc.user_a = auth.uid() and dm.created_at > coalesce(dc.user_a_last_read_at, '-infinity'::timestamptz))
          or (dc.user_b = auth.uid() and dm.created_at > coalesce(dc.user_b_last_read_at, '-infinity'::timestamptz))
        )
    ), 0);
$$;

grant execute on function public.get_unread_message_count(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Triggers — bump the parent thread's last_message_at, same shape as
-- support_ticket_messages' own "bump parent on new message" trigger (0019).
-- ----------------------------------------------------------------------------
create or replace function public.bump_channel_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end $$;

drop trigger if exists trg_bump_channel_last_message on public.channel_messages;
create trigger trg_bump_channel_last_message
  after insert on public.channel_messages
  for each row execute function public.bump_channel_last_message();

create or replace function public.bump_dm_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.direct_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_bump_dm_last_message on public.direct_messages;
create trigger trg_bump_dm_last_message
  after insert on public.direct_messages
  for each row execute function public.bump_dm_last_message();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.channel_reads enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

create policy "channels_select" on public.channels
  for select using (public.has_permission(organization_id, 'messaging.view'));
create policy "channels_insert" on public.channels
  for insert with check (public.has_permission(organization_id, 'messaging.create_channels') and created_by = auth.uid());
create policy "channels_update" on public.channels
  for update using (
    created_by = auth.uid()
    or public.is_org_admin(organization_id)
    or public.has_permission(organization_id, 'messaging.manage_channels')
  );

create policy "channel_messages_select" on public.channel_messages
  for select using (public.has_permission(organization_id, 'messaging.view'));
create policy "channel_messages_insert" on public.channel_messages
  for insert with check (
    public.has_permission(organization_id, 'messaging.send')
    and author_id = auth.uid()
    and exists (select 1 from public.channels c where c.id = channel_id and c.organization_id = organization_id and c.archived_at is null)
  );
-- Soft-delete only (client sets deleted_at) — own messages, or an org admin moderating.
create policy "channel_messages_update" on public.channel_messages
  for update using (author_id = auth.uid() or public.is_org_admin(organization_id));

create policy "channel_reads_all" on public.channel_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "direct_conversations_select" on public.direct_conversations
  for select using (auth.uid() in (user_a, user_b));
-- No insert/update policy — get_or_create_dm_conversation()/mark_dm_read() only.

create policy "direct_messages_select" on public.direct_messages
  for select using (exists (
    select 1 from public.direct_conversations dc
    where dc.id = conversation_id and auth.uid() in (dc.user_a, dc.user_b)
  ));
create policy "direct_messages_insert" on public.direct_messages
  for insert with check (
    author_id = auth.uid()
    and public.has_permission(organization_id, 'messaging.send')
    and exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id and dc.organization_id = organization_id and auth.uid() in (dc.user_a, dc.user_b)
    )
  );
-- Soft-delete only, own messages.
create policy "direct_messages_update" on public.direct_messages
  for update using (author_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_messages'
  ) then
    alter publication supabase_realtime add table public.channel_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Notification integration — DMs only. Channel messages deliberately do NOT
-- notify every member on every post (that's exactly the notification-spam
-- this session's Task Reminder Engine work went out of its way to avoid);
-- the sidebar unread badge is the channel-level signal instead. A DM is
-- personal and low-volume, so it gets a real notification, same as every
-- other single-recipient event in this app.
-- ----------------------------------------------------------------------------
alter type public.notification_category add value if not exists 'messaging';

create or replace function public.notify_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recipient uuid;
  actor_name text;
  org uuid;
begin
  select organization_id, case when user_a = new.author_id then user_b else user_a end
    into org, recipient
    from public.direct_conversations where id = new.conversation_id;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  select full_name into actor_name from public.profiles where id = new.author_id;
  perform public.notify_user(
    org, recipient, new.author_id, 'messaging', 'message.received',
    'conversation', new.conversation_id,
    coalesce(actor_name, 'Someone') || ' sent you a message', 'info'
  );
  return new;
end $$;

drop trigger if exists trg_notify_dm_message on public.direct_messages;
create trigger trg_notify_dm_message
  after insert on public.direct_messages
  for each row execute function public.notify_dm_message();
