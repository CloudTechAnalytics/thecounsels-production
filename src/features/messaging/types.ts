import type { Channel, ChannelMessage, DirectConversation, DirectMessage, Profile } from '@/shared/types/database.types'

type Author = Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null

export interface ChannelRow extends Channel {
  /** True when there's an unread message in this channel for the signed-in user (last_message_at > my last_read_at). */
  unread: boolean
}

export interface ChannelMessageRow extends ChannelMessage {
  author: Author
}

export interface ConversationRow extends DirectConversation {
  /** The other participant — never the signed-in user. */
  other: Author & { last_seen_at: string | null }
  unread: boolean
}

export interface DirectMessageRow extends DirectMessage {
  author: Author
}

/** A message row shared by both channel and DM threads, for the one <MessageThread/>. */
export interface ThreadMessage {
  id: string
  body: string
  createdAt: string
  deletedAt: string | null
  author: Author
}

export function toThreadMessage(m: ChannelMessageRow | DirectMessageRow): ThreadMessage {
  return { id: m.id, body: m.body, createdAt: m.created_at, deletedAt: m.deleted_at, author: m.author }
}

/** Presence, cheaply: profiles.last_seen_at is already touched on every session load. */
export function isRecentlyActive(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000
}
