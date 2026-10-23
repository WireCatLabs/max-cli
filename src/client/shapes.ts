/**
 * What MAX says that the shared model has no place for. These stay inside the client and the adapter; above
 * it, only `@wirecat/cli-core` types.
 */

import type {
  Attachment,
  Chat,
  Contact,
  ChatCard as CoreChatCard,
  GroupCard as CoreGroupCard,
  MessageChange as CoreMessageChange,
  GroupMember,
  GroupSettings,
  Id,
} from "@wirecat/cli-core"

/**
 * `max watch --events` prints what the shared changes do, plus who read a chat and a chat that changed. MAX
 * names a read message by its time, not its id (opcode 130, measured 2026-10-08), and sends a changed chat
 * whole (135, or a 128 with it).
 */
export type MessageChange =
  | CoreMessageChange
  | {
      event: "read"
      chatId: Id
      chatTitle: string | null
      userId: Id
      upToTime: string | null
      unreadCount: number | null
    }
  | { event: "chat"; chat: Chat }

export interface ChatCard extends CoreChatCard {
  description: string | null
  access: string | null
  /** `null` for a dialog, offline, or a group the login did not carry. */
  settings: GroupSettings | null
}

export interface GroupCard extends CoreGroupCard {
  /** `public`, `private` or `secret`, as MAX says it. */
  access: string | null
}

export interface GroupMembers {
  chatId: Id
  members: GroupMember[]
  /** Every page was read. */
  complete: boolean
  /** Whether `role` is filled in: the login names a group's owner and admins only for chats that changed lately. */
  rolesKnown: boolean
}

export interface ContactImport {
  /** How many numbers went to MAX. */
  sent: number
  /** The numbers MAX answered for — measured once, on the owner's own number, which it recognised. */
  recognised: string[]
  contacts: Contact[]
}

/**
 * What only MAX has about an attachment, kept under `providerRef`: a file or a video carries no link, only its
 * id (measured 2026-09-23), and a service message (`control`) names what happened — `new`, `add`, `remove`,
 * `pin`… — and the people it happened to.
 */
export interface MaxRef {
  fileId?: Id
  videoId?: Id
  event?: string
  userIds?: Id[]
}

export const maxRef = (attachment: Attachment): MaxRef => (attachment.providerRef ?? {}) as MaxRef
