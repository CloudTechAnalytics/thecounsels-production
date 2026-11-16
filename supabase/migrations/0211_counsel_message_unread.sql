-- ============================================================================
-- Migration 0211 — Unread counts for "Messages from The Counsel" (0210).
--
-- Each person keeps their own "read up to" time per conversation. The firm's
-- sidebar shows how many messages from The Counsel they have not opened yet,
-- and the list marks those conversations "New". Opening a conversation (or
-- replying in it) marks it read.
-- ============================================================================

create table if not exists public.support_ticket_reads (
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
alter table public.support_ticket_reads enable row level security;
drop policy if exists support_ticket_reads_own on public.support_ticket_reads;
create policy support_ticket_reads_own on public.support_ticket_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.support_ticket_reads to authenticated;

-- Mark one conversation read for the signed-in person (only if they can see it).
create or replace function public.mark_support_ticket_read(p_ticket uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.support_tickets where id = p_ticket) then return; end if;   -- RLS decides
  insert into public.support_ticket_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
  on conflict (ticket_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
grant execute on function public.mark_support_ticket_read(uuid) to authenticated;

-- Unread messages from The Counsel per conversation, for the signed-in person
-- in one firm. security invoker: RLS limits it to conversations they can see.
create or replace function public.my_unread_counsel_messages(p_org uuid)
returns table (ticket_id uuid, unread integer)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, count(m.id)::int
  from public.support_tickets t
  join public.support_ticket_messages m on m.ticket_id = t.id and m.from_platform
  left join public.support_ticket_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
  where t.organization_id = p_org
    and t.kind = 'platform_message'
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by t.id;
$$;
grant execute on function public.my_unread_counsel_messages(uuid) to authenticated;
