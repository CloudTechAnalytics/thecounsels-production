-- ============================================================================
-- Migration 0123 — Let each side of a DM delete the conversation from their
-- own list, WhatsApp/Slack-style: it disappears for the person who deleted
-- it, the other participant's copy and every message are untouched, and it
-- reappears automatically the moment a new message lands (or immediately if
-- they reopen it via New Message). There's no way to destroy a DM for both
-- sides — unlike a channel (delete_channel, migration 0064), a 1:1
-- conversation has no owner/admin who could reasonably do that to the other
-- participant, so this is a per-user hide, not a delete.
-- ============================================================================

alter table public.direct_conversations
  add column if not exists user_a_hidden_at timestamptz,
  add column if not exists user_b_hidden_at timestamptz;

-- Sets the caller's own hidden_at — same shape/guard as mark_dm_read
-- (migration 0061): silently no-ops if the caller isn't a participant,
-- same as that function, rather than raising.
create or replace function public.hide_dm_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.direct_conversations
  set user_a_hidden_at = case when user_a = auth.uid() then now() else user_a_hidden_at end,
      user_b_hidden_at = case when user_b = auth.uid() then now() else user_b_hidden_at end
  where id = p_conversation and auth.uid() in (user_a, user_b);
end;
$function$;

grant execute on function public.hide_dm_conversation(uuid) to authenticated;

-- Deliberately reopening a conversation you'd previously hidden (New
-- Message → picking that person again) should bring it back immediately,
-- not just wait for their next message.
create or replace function public.get_or_create_dm_conversation(p_org uuid, p_other uuid)
returns direct_conversations
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.org_has_feature(p_org, 'messaging') then
    raise exception 'Messaging is not included in your plan. Upgrade to Professional to use it.';
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
    update public.direct_conversations
    set user_a_hidden_at = case when user_a = auth.uid() then null else user_a_hidden_at end,
        user_b_hidden_at = case when user_b = auth.uid() then null else user_b_hidden_at end
    where id = rec.id
    returning * into rec;
    return rec;
  end if;

  insert into public.direct_conversations (organization_id, user_a, user_b)
  values (p_org, a, b)
  returning * into rec;
  return rec;
end;
$function$;
