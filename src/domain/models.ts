/**
 * What this CLI promises. **Raw MAX objects never reach output** (REQUIREMENTS §16, §25): the wire
 * shape is undocumented, changes without notice, and carries fields whose meaning nobody knows.
 * Everything above the adapter speaks these types.
 */

import type { Chat, Contact, Id, Member, Reactions, ChatCard as SharedChatCard } from "@leemour/cli-messaging"

/**
 * The shared model where MAX says the same thing; below, only what MAX says differently or alone.
 * What MAX does with the shared ones, measured:
 *
 * - `Id` — MAX ids are 64-bit, so a string, never a number.
 * - `AttachmentLink` — no token and no cookie needed to fetch it (2026-09-23).
 * - `ChatEvent.event` — `new`, `add`, `remove`, `pin` seen; anything else passes through.
 * - `Contact.lastMessagedAt` — MAX does not send it on a contact: it comes from the chat.
 * - `AccountSession` — MAX gives a session no id, so none can be ended alone.
 */
export type {
  AccountSession,
  AttachmentLink,
  Chat,
  ChatEvent,
  ChatEvents,
  ChatKind,
  Contact,
  Deletion,
  Id,
  Member,
  Page,
  PersonCard,
  Pin,
  Profile,
  Reactions,
  ReadMark,
} from "@leemour/cli-messaging"

export interface Attachment {
  /** Lower-cased MAX type: `photo`, `video`, `file`, `share`, `call`, `control`, `sticker`… */
  kind: string
  /**
   * A photo's image or a shared page. ⚠ Measured 2026-09-22: a photo link opens with no cookie and
   * no token, so whoever holds it sees the picture.
   */
  url?: string
  width?: number
  height?: number
  /** A shared page's title. */
  title?: string
  /** A file's name and size, measured 2026-09-23. */
  name?: string
  size?: number
  /** A file or a video carries no link, only these; `messages download` asks MAX for the link. */
  fileId?: Id
  videoId?: Id
  /** A service message (`control`): what happened, as MAX names it — `new`, `add`, `remove`, `pin`… */
  event?: string
  /** A service message: the people it happened to. Who did it is the message's sender. */
  userIds?: Id[]
  /** Absent on a `poll` newer than the version measured (`version` above 2). */
  poll?: Poll
}

/** A poll as the owner sees it. The settings bits are unpacked here and nowhere else. */
export interface Poll {
  id: Id
  question: string
  answers: PollAnswer[]
  /** How many people voted, not how many votes: one person may pick several answers. */
  total: number
  multiple: boolean
  anonymous: boolean
  revote: boolean
  closed: boolean
  quiz: boolean
}

export interface PollAnswer {
  /** What `max polls vote` takes — MAX's own answer id, not a position in the list. */
  id: Id
  text: string
  votes: number
  /** The owner voted for this one. */
  mine: boolean
}

/** A poll and the message that carries it — what `max polls` answers with. */
export interface PollMessage {
  chatId: Id
  messageId: Id
  poll: Poll
}

/** The message a reply answers or a forward carries — MAX sends it whole, inside the one that links to it. */
export interface QuotedMessage {
  id: Id
  senderId: Id | null
  senderName: string | null
  /** ISO 8601, or `null` when the quote did not say. */
  timestamp: string | null
  text: string
  attachments: Attachment[]
  /** Whether this account wrote it. `null` when we do not know who we are. */
  outgoing: boolean | null
}

export interface Message {
  id: Id
  chatId: Id
  senderId: Id | null
  senderName: string | null
  /** ISO 8601. */
  timestamp: string
  /**
   * When MAX last recorded an edit, or `null` for a message nobody has changed.
   *
   * Measured 2026-09-20: an edited message comes back carrying `status: "EDITED"` and an
   * `updateTime` later than its `time`. Surfaced rather than hidden because a reader has no other
   * way to tell an edited message from the original, and because it is what the cache compares to
   * decide whether the copy it holds is still current.
   */
  editedAt: string | null
  text: string
  /** Whether this account sent it. `null` when we do not know who we are. */
  outgoing: boolean | null
  attachments: Attachment[]
  replyTo: QuotedMessage | null
  forwardedFrom: QuotedMessage | null
  /**
   * `null` when nobody asked — `--offline`, or the request failed. ~~History does not carry
   * reactions~~ **Correction 2026-10-06:** a channel's history carries `reactionInfo` with counts (measured
   * with `pnpm probe:channel-posts`); elsewhere it is `{}` and they come from a request of their own.
   */
  reactions: Reactions | null
  /** ISO 8601 — when MAX will send it. Present only on a message still waiting in the queue. */
  scheduledFor?: string
  /** A channel post's `stats.views`, where MAX sends it (measured 2026-10-05, `pnpm probe:channel-posts`). */
  providerMetadata?: { views: number }
}

/**
 * A message found by searching, carrying the chat's name as well as its id.
 *
 * A search spans every chat, so an answer that named only the id would make the reader look each
 * one up to understand their own results. The title is what the store already holds; it is `null`
 * for a chat MAX never titled.
 */
export interface MessageHit extends Message {
  chatTitle: string | null
}

/**
 * What happened to a message after it arrived, as `max watch --events` prints it (`MAX-34`). MAX
 * pushes an edit and a deletion as the same message again with `status` `EDITED` or `REMOVED`, and
 * a reaction as opcode 155 (tab recording 2026-09-25).
 */
export type MessageChange =
  | { event: "edit"; message: MessageHit }
  | { event: "delete"; chatId: Id; chatTitle: string | null; messageId: Id }
  | { event: "reaction"; chatId: Id; chatTitle: string | null; messageId: Id; reactions: Reactions }

/** A group's member as MAX lists them (`max chats members list`). */
export interface GroupMember extends Member {
  /** ISO 8601, when the MAX account was created — a days-old account is worth a look. */
  registeredAt: string | null
  /** ISO 8601, when MAX last saw them; `null` when their privacy hides it. */
  lastSeenAt: string | null
  /** Absent where the login did not say who runs the group. */
  role?: "owner" | "admin" | "member"
}

export interface GroupMembers {
  chatId: Id
  members: GroupMember[]
  /** Every page was read. */
  complete: boolean
  /** Whether `role` is filled in: the login names a group's owner and admins only for chats that changed lately. */
  rolesKnown: boolean
}

/** The shared card, plus what MAX tells about a group. */
export interface ChatCard extends SharedChatCard {
  description: string | null
  access: string | null
  /** `null` for a dialog, offline, or a group the login did not carry. */
  settings: GroupSettings | null
}

/** The settings MAX lets a group's owner change, under our names. */
export interface GroupSettings {
  allCanPin: boolean | null
  onlyAdminsAdd: boolean | null
  onlyAdminsCall: boolean | null
  onlyOwnerEditsInfo: boolean | null
  membersSeeLink: boolean | null
}

/** A group or channel as the group commands answer it. */
export interface GroupCard extends Chat {
  description: string | null
  /** `public`, `private` or `secret`, as MAX says it. */
  access: string | null
  /** The invite link. Only a member who may see it gets one. */
  link: string | null
  settings: GroupSettings
}

/** A chat folder. MAX's own filters and options are kept inside the client and sent back untouched. */
export interface Folder {
  id: string
  title: string
  /** Chats added to it by hand. A folder that selects by filter lists none. */
  chatIds: Id[]
}

export interface ContactImport {
  /** How many numbers went to MAX. */
  sent: number
  /** The numbers MAX answered for — measured once, on the owner's own number, which it recognised. */
  recognised: string[]
  contacts: Contact[]
}

/** One message of a window around another, which carries `anchor: true`. */
export type WindowedMessage = Message & { anchor?: true }

/**
 * When a message was sent, read from its id: **`id >> 16` is the send time in milliseconds**, the
 * low 16 bits a counter. Measured 2026-09-22 on three messages across two days, exact every time.
 * `undefined` for anything that is not a message id.
 */
export const timeOfMessageId = (id: Id): number | undefined => {
  if (!/^\d{10,20}$/.test(id)) return undefined
  const time = Number(BigInt(id) >> 16n)
  return Number.isSafeInteger(time) && time > 0 ? time : undefined
}
