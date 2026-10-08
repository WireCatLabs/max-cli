import { CliError } from "@leemour/cli-core"
import { asId, type Payload } from "../protocol/frame.js"
import type {
  AccountSession,
  Attachment,
  Audience,
  Button,
  ButtonKind,
  CallRecord,
  Chat,
  ChatKind,
  Contact,
  Folder,
  GroupCard,
  GroupMember,
  GroupSettings,
  Id,
  Message,
  Poll,
  PrivacySettings,
  Profile,
  ProfileFacts,
  QuotedMessage,
  Reactions,
  Sticker,
  StickerSet,
} from "./models.js"

/**
 * Wire shapes into our own types.
 *
 * **Tolerant when reading** (REQUIREMENTS §29): an unknown field is ignored, a missing one becomes
 * `null`, and nothing here throws. This is an unofficial protocol — a response that gained a field
 * must not break a command, and a response that lost one must say so rather than invent a value.
 */

export interface NameLookup {
  /** Display names by user id, built from the `contacts` the login response carries. */
  names?: Map<Id, string>
  /** Whose account this is, so a message can say whether it is ours. */
  viewerId?: Id
}

export const toChat = (raw: Payload): Chat => ({
  id: asId(raw.id) ?? "",
  title: text(raw.title),
  kind: chatKind(raw.type),
  unreadCount: count(raw.newMessages),
  lastMessageAt: timestamp(raw.lastEventTime ?? asRecord(raw.lastMessage)?.time),
  participantsCount: count(raw.participantsCount),
})

/** Our name for each flag MAX lets an owner write (PyMax `ChatOption`); the rest are read-only. */
export const SETTING_FLAGS: Record<keyof GroupSettings, string> = {
  allCanPin: "ALL_CAN_PIN_MESSAGE",
  onlyAdminsAdd: "ONLY_ADMIN_CAN_ADD_MEMBER",
  onlyAdminsCall: "ONLY_ADMIN_CAN_CALL",
  onlyOwnerEditsInfo: "ONLY_OWNER_CAN_CHANGE_ICON_TITLE",
  membersSeeLink: "MEMBERS_CAN_SEE_PRIVATE_LINK",
}

export const toGroupCard = (raw: Payload): GroupCard => {
  // A dialog's `options` is a number (max-api-docs), so nothing in it is one of these flags.
  const options = asRecord(raw.options)
  const flag = (name: string) => (typeof options?.[name] === "boolean" ? (options[name] as boolean) : null)
  const settings = Object.fromEntries(
    Object.entries(SETTING_FLAGS).map(([ours, theirs]) => [ours, flag(theirs)]),
  ) as unknown as GroupSettings

  return {
    ...toChat(raw),
    description: text(raw.description),
    access: typeof raw.access === "string" ? raw.access.toLowerCase() : null,
    link: text(raw.link),
    settings,
  }
}

export const toMessage = (raw: Payload, chatId: Id, lookup: NameLookup = {}): Message => {
  const senderId = asId(raw.sender)

  return {
    id: asId(raw.id) ?? "",
    chatId,
    senderId: senderId ?? null,
    senderName: senderId ? (lookup.names?.get(senderId) ?? null) : null,
    timestamp: timestamp(raw.time) ?? new Date(0).toISOString(),
    editedAt: timestamp(raw.updateTime),
    text: text(raw.text) ?? "",
    outgoing: lookup.viewerId === undefined || senderId === undefined ? null : senderId === lookup.viewerId,
    attachments: attachments(raw.attaches),
    ...linked(raw.link, lookup),
    reactions: historyReactions(raw.reactionInfo),
    ...scheduled(raw.delayedAttributes),
    providerMetadata: { ...counted(raw.stats).providerMetadata, graph: rankingGraph(raw) },
  }
}

const rankingGraph = (raw: Payload): NonNullable<Message["providerMetadata"]>["graph"] => {
  const link = asRecord(raw.link)
  if (link?.type === "REPLY") {
    const messageId = asId(asRecord(link.message)?.id)
    const chatId = asId(link.chatId)
    return { version: 1, ...(messageId && chatId ? { reply: { chatId, messageId } } : {}) }
  }
  return {
    version: 1,
    ...(asId(raw.id) !== undefined && typeof raw.time === "number" ? { reply: null } : {}),
  }
}

const counted = (value: unknown): Pick<Message, "providerMetadata"> => {
  const views = asRecord(value)?.views
  return typeof views === "number" ? { providerMetadata: { views } } : {}
}

/** Only with `totalCount`: other chats' history sends `{}` whatever the reactions are (measured 2026-09-23). */
const historyReactions = (value: unknown): Reactions | null => {
  const info = asRecord(value)
  return info?.totalCount === undefined ? null : toReactions(info)
}

const scheduled = (value: unknown): Pick<Message, "scheduledFor"> => {
  const at = timestamp(asRecord(value)?.timeToFire)
  return at ? { scheduledFor: at } : {}
}

/** Measured 2026-09-22: `link: { type: "REPLY" | "FORWARD", chatId, message: { id, sender, text, time, attaches } }`. */
const linked = (value: unknown, lookup: NameLookup): Pick<Message, "replyTo" | "forwardedFrom"> => {
  const link = asRecord(value)
  const quoted = asRecord(link?.message)
  const message = quoted ? toQuoted(quoted, lookup) : null
  return {
    replyTo: link?.type === "REPLY" ? message : null,
    forwardedFrom: link?.type === "FORWARD" ? message : null,
  }
}

const toQuoted = (raw: Payload, lookup: NameLookup): QuotedMessage => {
  const senderId = asId(raw.sender) ?? null
  return {
    id: asId(raw.id) ?? "",
    senderId,
    senderName: senderId ? (lookup.names?.get(senderId) ?? null) : null,
    timestamp: timestamp(raw.time),
    text: text(raw.text) ?? "",
    attachments: attachments(raw.attaches),
    outgoing: lookup.viewerId === undefined || senderId === null ? null : senderId === lookup.viewerId,
  }
}

/** `lastMessagedAt` is always `null` here: MAX puts it on the chat, and only the store has both. */
export const toContact = (raw: Payload): Contact => ({
  id: asId(raw.id) ?? "",
  name: displayName(raw.names) ?? text(raw.name),
  username: text(raw.link),
  description: text(raw.description),
  lastMessagedAt: null,
})

/**
 * One entry of opcode 59 `MEMBER`: `{contact, presence: {seen, status?}, readMark}` (measured
 * 2026-09-27). The unit of `seen` and `registrationTime` was not seen, so both are read either way.
 */
export const toGroupMember = (raw: Payload): GroupMember => {
  const contact = asRecord(raw.contact) ?? {}
  const { id, name, username } = toContact(contact)
  return {
    id,
    name,
    username,
    registeredAt: timestamp(inMilliseconds(contact.registrationTime)),
    lastSeenAt: timestamp(inMilliseconds(asRecord(raw.presence)?.seen)),
  }
}

/**
 * One `CONTACT_INFO` contact as `contacts profile` shows it. MAX tells when the account was made and
 * whether it has a photo; `options` naming `BOT` marks a bot (measured 2026-10-08, `pnpm probe:bot-link info`).
 */
export const toProfileFacts = (raw: Payload, chats: ProfileFacts["chats"]): ProfileFacts => {
  const { id, name, username, description } = toContact(raw)
  const registered = timestamp(inMilliseconds(raw.registrationTime))
  return {
    id,
    name,
    usernames: username ? [username] : [],
    bio: description,
    ...(raw.phone === undefined || raw.phone === null ? {} : { phone: String(raw.phone) }),
    flags: Array.isArray(raw.options) ? { bot: raw.options.includes("BOT") } : {},
    ...(registered ? { registered: { at: registered, source: "max", precision: "day" } } : {}),
    hasPhoto: raw.photoId !== undefined && raw.photoId !== null,
    chats,
  }
}

/** One person's entry of opcode 35 `{seen, status?}`; `status` 1 is online in the tab's code, never measured. */
export const toSeen = (raw: Payload | undefined): ProfileFacts["seen"] => {
  if (raw?.status === 1) return "online"
  return timestamp(inMilliseconds(raw?.seen)) ?? undefined
}

/** Seconds and milliseconds since 1970 differ by three orders: before 2001 in ms is a time in seconds. */
const inMilliseconds = (value: unknown): number | null => {
  const n = count(value)
  if (n === null) return null
  return n < 1e12 ? n * 1000 : n
}

export const toProfile = (raw: Payload): Profile => {
  const contact = asRecord(raw.contact) ?? raw

  return {
    id: asId(contact.id) ?? "",
    name: displayName(contact.names) ?? text(contact.name),
    // The login's own profile carries `phone` as a bare integer (measured 2026-09-24).
    phone: phone(contact.phones) ?? text(contact.phone) ?? digits(contact.phone),
    description: text(contact.description),
  }
}

export const toFolder = (raw: Payload): Folder => ({
  id: text(raw.id) ?? "",
  title: text(raw.title) ?? "",
  chatIds: (Array.isArray(raw.include) ? raw.include : []).map(asId).filter((id): id is Id => id !== undefined),
})

export const toSession = (raw: Payload): AccountSession => ({
  current: raw.current === true,
  client: text(raw.client),
  device: text(raw.info),
  location: text(raw.location),
  lastActiveAt: timestamp(raw.time),
})

/** A call in the history 163 answers (measured 2026-10-08); `HUNGUP` is one that was picked up, as the web client reads it. */
export const toCallRecord = (raw: Payload, self: Id | undefined): CallRecord => {
  const callerId = asId(raw.callerId) ?? null
  const hangup = typeof raw.hangupType === "string" ? raw.hangupType : ""
  const direction = callerId !== null && callerId === self ? "outgoing" : "incoming"
  const duration = typeof raw.durationMs === "number" && raw.durationMs > 0 ? Math.round(raw.durationMs / 1000) : null
  return {
    id: asId(raw.historyId) ?? asId(raw.callId) ?? "",
    chatId: asId(raw.chatId) ?? null,
    callerId,
    direction,
    outcome: hangup === "HUNGUP" ? "answered" : hangup === "MISSED" ? "missed" : "declined",
    kind: raw.callType === "VIDEO" ? "video" : "audio",
    at: timestamp(raw.time) ?? new Date(0).toISOString(),
    durationSeconds: duration,
  }
}

const audience = (value: unknown, fallback: Audience): Audience =>
  value === "ALL"
    ? "everyone"
    : value === "CONTACTS"
      ? "contacts"
      : value === "NOBODY" || value === "_NONE_"
        ? "nobody"
        : fallback

/**
 * The privacy part of the settings LOGIN carries. A key left out means MAX's default, as the web client
 * reads it (chunk `Cdo8IOYe`, 2026-10-08): everyone may find, call and invite; contacts see the number.
 */
export const toPrivacy = (user: Payload): PrivacySettings => ({
  findByPhone: audience(user.SEARCH_BY_PHONE, "everyone"),
  phoneNumber: audience(user.PHONE_NUMBER_PRIVACY, "contacts"),
  calls: audience(user.INCOMING_CALL, "everyone"),
  chatInvites: audience(user.CHATS_INVITE, "everyone"),
  hideOnline: user.HIDDEN === true,
})

const MAX_AUDIENCE = { everyone: "ALL", contacts: "CONTACTS", nobody: "NOBODY" } as const

/** The other way: only the settings named, as MAX names them. MAX finds an account by number for everyone or contacts only. */
export const fromPrivacy = (change: PrivacySettings): Record<string, string | boolean> => {
  if (change.findByPhone === "nobody")
    throw new CliError(
      "validation_error",
      "MAX lets everyone or only contacts find the account by its number, not nobody",
    )
  return Object.fromEntries(
    Object.entries({
      SEARCH_BY_PHONE: change.findByPhone && MAX_AUDIENCE[change.findByPhone],
      PHONE_NUMBER_PRIVACY: change.phoneNumber && MAX_AUDIENCE[change.phoneNumber],
      INCOMING_CALL: change.calls && MAX_AUDIENCE[change.calls],
      CHATS_INVITE: change.chatInvites && MAX_AUDIENCE[change.chatInvites],
      HIDDEN: change.hideOnline,
    }).filter(([, value]) => value !== undefined),
  ) as Record<string, string | boolean>
}

export const toStickerSet = (raw: Payload): StickerSet => ({
  id: asId(raw.id) ?? "",
  title: typeof raw.name === "string" ? raw.name : "",
  count: Array.isArray(raw.stickers) ? raw.stickers.length : 0,
  link: typeof raw.link === "string" && raw.link !== "" ? raw.link : null,
})

export const toSticker = (raw: Payload): Sticker => ({
  id: asId(raw.id) ?? "",
  setId: asId(raw.setId) ?? null,
  emoji: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
  url: typeof raw.url === "string" && raw.url !== "" ? raw.url : null,
})

/** The names a login response carries, so a message can name its sender without another request. */
export const namesFrom = (contacts: unknown): Map<Id, string> => {
  const names = new Map<Id, string>()
  if (!Array.isArray(contacts)) return names

  for (const entry of contacts) {
    const contact = asRecord(entry)
    if (!contact) continue
    const id = asId(contact.id)
    const name = displayName(contact.names) ?? text(contact.name)
    if (id && name) names.set(id, name)
  }
  return names
}

const asRecord = (value: unknown): Payload | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Payload) : undefined

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null)

const count = (value: unknown): number | null => {
  const asNumber = typeof value === "bigint" ? Number(value) : value
  return typeof asNumber === "number" && Number.isFinite(asNumber) ? asNumber : null
}

/** MAX sends Unix milliseconds; output is ISO 8601, which sorts, parses and needs no timezone guess. */
const timestamp = (value: unknown): string | null => {
  const ms = count(value)
  if (ms === null || ms <= 0) return null
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const chatKind = (value: unknown): ChatKind => {
  switch (typeof value === "string" ? value.toUpperCase() : "") {
    case "DIALOG":
      return "dialog"
    case "CHAT":
      return "group"
    case "CHANNEL":
      return "channel"
    default:
      return "unknown"
  }
}

/**
 * `names` is a list of `{name, type}`. The name the owner gave them (`CUSTOM`, measured 2026-09-27)
 * wins, as in the app; then the full name; any name beats none.
 */
const displayName = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null
  const entries = value.map(asRecord).filter((entry): entry is Payload => entry !== undefined)
  const named = (type: string) => text(entries.find((entry) => entry.type === type)?.name)
  return named("CUSTOM") ?? named("FULL_NAME") ?? text(entries[0]?.name)
}

const digits = (value: unknown): string | null =>
  typeof value === "number" || typeof value === "bigint" ? `+${value}` : null

/** The last four digits only, unless the owner asks for the whole number (`NEED-209`). */
export const maskedProfile = (profile: Profile): Profile => ({
  ...profile,
  phone: profile.phone === null ? null : `***${profile.phone.replace(/\D/g, "").slice(-4)}`,
})

const phone = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null
  const first = asRecord(value[0])
  const number = first?.number
  return text(number) ?? (typeof number === "number" || typeof number === "bigint" ? `+${number}` : null)
}

/** `reactionInfo` as the reaction request answers it (measured 2026-09-23). */
export const toReactions = (raw: Payload): Reactions => {
  const counts = (Array.isArray(raw.counters) ? raw.counters : [])
    .map(asRecord)
    .filter((entry): entry is Payload => entry !== undefined)
    .map((entry) => ({ reaction: text(entry.reaction) ?? "", count: count(entry.count) ?? 0 }))
  return { counts, mine: text(raw.yourReaction), total: count(raw.totalCount) ?? 0 }
}

/**
 * What an attachment is and where it lives — never its bytes. The link fields are the ones
 * `pnpm probe:attachments` measured on 2026-09-22: `baseUrl` on a photo, `url` on a share. A file
 * and a video have no link, only `fileId` and `videoId` (measured 2026-09-23). A service message is
 * `CONTROL` with `event`, and `userIds` for `new`/`add` but a single `userId` for `remove`
 * (`pnpm probe:control`, 2026-09-27).
 */
const attachments = (value: unknown): Attachment[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((entry): entry is Payload => entry !== undefined)
    .map((entry) => {
      const url = text(entry.baseUrl) ?? text(entry.url)
      const width = count(entry.width)
      const height = count(entry.height)
      const title = text(entry.title)
      const name = text(entry.name)
      const size = count(entry.size)
      const fileId = asId(entry.fileId)
      const videoId = asId(entry.videoId)
      const event = text(entry.event)
      const people = Array.isArray(entry.userIds)
        ? entry.userIds
        : entry.userId === undefined
          ? undefined
          : [entry.userId]
      const userIds = people?.map(asId).filter((id): id is Id => id !== undefined)
      const poll = entry._type === "POLL" ? toPoll(entry) : undefined
      const buttons = entry._type === "INLINE_KEYBOARD" ? toButtons(entry) : undefined
      return {
        kind: typeof entry._type === "string" ? entry._type.toLowerCase() : "unknown",
        ...(url ? { url } : {}),
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(title ? { title } : {}),
        ...(name ? { name } : {}),
        ...(size !== null ? { size } : {}),
        ...(fileId ? { fileId } : {}),
        ...(videoId ? { videoId } : {}),
        ...(event ? { event } : {}),
        ...(userIds ? { userIds } : {}),
        ...(poll ? { poll } : {}),
        ...(buttons ? { buttons } : {}),
      }
    })
}

const BUTTON_KINDS: Record<string, ButtonKind> = {
  CALLBACK: "callback",
  LINK: "link",
  MESSAGE: "message",
  CHAT: "chat",
  REQUEST_CONTACT: "contact",
  REQUEST_GEO_LOCATION: "location",
  OPEN_APP: "app",
  CLIPBOARD: "clipboard",
}

/** A bot's keyboard: `{callbackId, keyboard: {buttons: [[{type, text, payload, url, intent}]]}}` (measured 2026-10-08). */
export const toButtons = (entry: Payload): Button[][] => {
  const rows = asRecord(entry.keyboard)?.buttons
  return (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row) ? row : []).map((raw) => {
      const button = asRecord(raw) ?? {}
      const kind = BUTTON_KINDS[String(button.type)] ?? "other"
      const url = kind === "link" ? text(button.url) : null
      return { kind, text: text(button.text) ?? "", ...(url ? { url } : {}) }
    }),
  )
}

/** The bits of a poll's `settings`, as web.max.ru names them (bundle read 2026-09-24, `FIND-140`). */
const POLL_ANONYMOUS = 1
const POLL_MULTIPLE = 2
const POLL_REVOTE = 4
export const POLL_CLOSED = 8
const POLL_QUIZ = 16
/** In `state.result[].options`: the owner voted for this answer. */
const ANSWER_VOTED = 1

/**
 * The newest shape measured: MAX makes every new poll version 2 (`FIND-247`), which web.max.ru
 * does not show. A newer one is skipped, since an unknown shape is worse than none.
 */
const POLL_VERSION = 2

export const toPoll = (entry: Payload): Poll | undefined => {
  const version = count(entry.version)
  const id = asId(entry.pollId)
  if (!id || (version !== null && version > POLL_VERSION)) return undefined

  const settings = count(entry.settings) ?? 0
  const state = asRecord(entry.state)
  const results = new Map<string, Payload>()
  for (const raw of Array.isArray(state?.result) ? state.result : []) {
    const result = asRecord(raw)
    const answerId = asId(result?.answerId)
    if (result && answerId) results.set(answerId, result)
  }

  const answers = (Array.isArray(entry.answers) ? entry.answers : [])
    .map(asRecord)
    .filter((answer): answer is Payload => answer !== undefined)
    .map((answer) => {
      const answerId = asId(answer.answerId) ?? ""
      const result = results.get(answerId)
      return {
        id: answerId,
        text: typeof answer.text === "string" ? answer.text : "",
        votes: count(result?.voteCount) ?? 0,
        mine: ((count(result?.options) ?? 0) & ANSWER_VOTED) !== 0,
      }
    })
    .filter((answer) => answer.id !== "")

  return {
    id,
    question: typeof entry.title === "string" ? entry.title : "",
    answers,
    total: count(state?.total) ?? 0,
    multiple: (settings & POLL_MULTIPLE) !== 0,
    anonymous: (settings & POLL_ANONYMOUS) !== 0,
    revote: (settings & POLL_REVOTE) !== 0,
    closed: (settings & POLL_CLOSED) !== 0,
    quiz: (settings & POLL_QUIZ) !== 0,
  }
}

/** The settings bits a new poll is created with. */
export const pollSettings = ({
  multiple = false,
  anonymous = false,
  revote = false,
}: {
  multiple?: boolean
  anonymous?: boolean
  revote?: boolean
}): number => (multiple ? POLL_MULTIPLE : 0) | (anonymous ? POLL_ANONYMOUS : 0) | (revote ? POLL_REVOTE : 0)
