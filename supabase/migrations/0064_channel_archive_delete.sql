-- ============================================================================
-- Migration 0064 — Communication Hub: archive and hard-delete a channel.
--
-- Archive (reversible): already possible under the existing
-- channels_update RLS policy (creator, org admin, or messaging.
-- manage_channels holders) — nothing new needed, the frontend just never
-- exposed it. This migration only adds the destructive path.
--
-- Delete (irreversible, "everything in it"): deliberately NOT a raw RLS
-- delete policy — routed only through this RPC, same "RPC is the only
-- writer" discipline as clear_audit_log() (0062), so the deletion can
-- never happen without also being recorded in audit_logs first. Cascades
-- to channel_messages/channel_reads via their existing FKs.
-- ============================================================================

create or replace function public.delete_channel(p_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  msg_count int;
  actor_name text;
begin
  select id, organization_id, name, created_by into ch from public.channels where id = p_channel;
  if ch.id is null then
    raise exception 'Channel not found';
  end if;

  if not (
    ch.created_by = auth.uid()
    or public.is_org_admin(ch.organization_id)
    or public.has_permission(ch.organization_id, 'messaging.manage_channels')
  ) then
    raise exception 'You do not have permission to delete this channel' using errcode = '42501';
  end if;

  select count(*) into msg_count from public.channel_messages where channel_id = p_channel;
  select full_name into actor_name from public.profiles where id = auth.uid();

  delete from public.channels where id = p_channel;

  perform public.log_audit(
    ch.organization_id, 'channel.deleted', 'channel', p_channel,
    format('%s deleted channel "#%s" and %s message%s',
      coalesce(actor_name, 'Someone'), ch.name, msg_count, case when msg_count = 1 then '' else 's' end),
    '{}'::jsonb, false
  );
end;
$$;

grant execute on function public.delete_channel(uuid) to authenticated;
