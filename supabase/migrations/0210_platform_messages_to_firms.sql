-- ============================================================================
-- Migration 0210 — The Counsel can message a firm (and the firm can reply).
--
-- Built on the existing support-ticket threads (0019): a conversation the
-- PLATFORM starts is a support_tickets row with kind = 'platform_message'.
--   * The platform admin picks who in the firm receives it (one, several or
--     all active members) and may add other email addresses.
--   * It is emailed to each of them (edge function send-ticket-email) and
--     shows in-app as a chat they can answer — also while their trial or
--     subscription has expired, since the page sits outside that gate.
--   * Only the chosen recipients and the firm's admins (members.manage) see
--     a platform message; ordinary firm-raised tickets stay visible to the
--     whole firm, as before.
-- ============================================================================

alter table public.support_tickets
  add column if not exists kind text not null default 'support' check (kind in ('support', 'platform_message')),
  add column if not exists recipient_user_ids uuid[] not null default '{}',
  add column if not exists extra_emails text[] not null default '{}';

create index if not exists idx_support_tickets_kind on public.support_tickets (kind, updated_at desc);

-- Who in a firm can see a ticket.
create or replace function public.can_see_support_ticket(p_org uuid, p_kind text, p_recipients uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or (public.is_org_member(p_org)
          and (p_kind = 'support'
               or auth.uid() = any(p_recipients)
               or public.has_permission(p_org, 'members.manage')));
$$;
grant execute on function public.can_see_support_ticket(uuid, text, uuid[]) to authenticated;

drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets
  for select using (public.can_see_support_ticket(organization_id, kind, recipient_user_ids));

-- Firms raise ordinary tickets only; platform messages are created by the RPC below.
drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets
  for insert with check (public.is_platform_admin() or (public.is_org_member(organization_id) and kind = 'support'));

drop policy if exists "support_tickets_update" on public.support_tickets;
create policy "support_tickets_update" on public.support_tickets
  for update using (public.can_see_support_ticket(organization_id, kind, recipient_user_ids));

-- Messages follow the ticket's visibility.
drop policy if exists "ticket_messages_select" on public.support_ticket_messages;
create policy "ticket_messages_select" on public.support_ticket_messages
  for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id
                            and public.can_see_support_ticket(t.organization_id, t.kind, t.recipient_user_ids)));
drop policy if exists "ticket_messages_insert" on public.support_ticket_messages;
create policy "ticket_messages_insert" on public.support_ticket_messages
  for insert with check (exists (select 1 from public.support_tickets t where t.id = ticket_id
                                 and public.can_see_support_ticket(t.organization_id, t.kind, t.recipient_user_ids)));

-- Start a conversation with a firm --------------------------------------------
create or replace function public.platform_message_firm(
  p_org uuid, p_subject text, p_body text, p_recipients uuid[], p_extra_emails text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_recipients uuid[];
  v_emails text[];
  r uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted' using errcode = '42501'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Add a subject'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write your message'; end if;

  -- only active members of this firm
  select coalesce(array_agg(distinct m.user_id), '{}') into v_recipients
  from public.memberships m
  where m.organization_id = p_org and m.status = 'active' and m.user_id = any(coalesce(p_recipients, '{}'));

  select coalesce(array_agg(distinct lower(trim(e))), '{}') into v_emails
  from unnest(coalesce(p_extra_emails, '{}')) e
  where trim(e) <> '';
  if exists (select 1 from unnest(v_emails) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'One of the email addresses is not valid';
  end if;
  if cardinality(v_recipients) + cardinality(v_emails) = 0 then
    raise exception 'Choose at least one person to send it to';
  end if;

  insert into public.support_tickets (organization_id, subject, status, priority, created_by, assignee_id, kind, recipient_user_ids, extra_emails)
  values (p_org, trim(p_subject), 'waiting', 'medium', auth.uid(), auth.uid(), 'platform_message', v_recipients, v_emails)
  returning id into v_id;

  insert into public.support_ticket_messages (ticket_id, body) values (v_id, trim(p_body));

  foreach r in array v_recipients loop
    perform public.notify_user(p_org, r, auth.uid(), 'support'::public.notification_category, 'platform.message', 'support_ticket', v_id,
      'Message from The Counsel: ' || trim(p_subject), 'info'::public.notification_priority);
  end loop;

  perform public.log_audit(p_org, 'support.platform_message', 'support_ticket', v_id,
    'The Counsel sent a message: ' || trim(p_subject),
    jsonb_build_object('recipients', cardinality(v_recipients), 'extra_emails', cardinality(v_emails)));
  return v_id;
end;
$$;
grant execute on function public.platform_message_firm(uuid, text, text, uuid[], text[]) to authenticated;

-- Replies keep the conversation's status and the firm's bell up to date -----
create or replace function public.after_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.support_tickets;
  r uuid;
begin
  select * into t from public.support_tickets where id = new.ticket_id;
  if t.kind <> 'platform_message' then return null; end if;
  if new.from_platform then
    -- not the opening message (the RPC notifies for that one)
    if exists (select 1 from public.support_ticket_messages where ticket_id = t.id and id <> new.id) then
      update public.support_tickets set status = 'waiting' where id = t.id and status <> 'waiting';
      foreach r in array t.recipient_user_ids loop
        perform public.notify_user(t.organization_id, r, new.author_id, 'support'::public.notification_category, 'platform.reply', 'support_ticket', t.id,
          'New reply from The Counsel: ' || t.subject, 'info'::public.notification_priority);
      end loop;
    end if;
  else
    -- the firm answered: it needs our attention again
    update public.support_tickets set status = 'open' where id = t.id and status <> 'open';
  end if;
  return null;
end;
$$;
revoke execute on function public.after_ticket_message() from public, anon, authenticated;

drop trigger if exists trg_after_ticket_message on public.support_ticket_messages;
create trigger trg_after_ticket_message
  after insert on public.support_ticket_messages
  for each row execute function public.after_ticket_message();

-- When the email for a message went out (send-ticket-email sets it once, so a
-- retried call never emails twice).
alter table public.support_ticket_messages add column if not exists emailed_at timestamptz;
