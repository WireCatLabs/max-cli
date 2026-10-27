import { CliError } from "@wirecat/cli-base"
import type { Chat, ChatKind, Id, Message, Page } from "@wirecat/cli-core"
import { providerErrorKey } from "@wirecat/cli-core/cli"
import type { ChatAction, Upload as SharedUpload } from "@wirecat/cli-core/sends"
import { shownTime } from "../output.js"
import { ProtocolError } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import type { Resume } from "../session/handshake.js"
import { loginPausedUntil, type SessionState, type SessionStore } from "../session/store.js"
import type { ASSET_TYPES } from "../spec/operations/assets.js"
import type { GroupCard } from "./shapes.js"

export interface ChatChange {
  chatId: Id
  action: ChatAction
  people: Id[]
  chat: GroupCard | null
}

export type AdminRight = "read" | "members" | "admins" | "info" | "pin" | "link" | "post" | "edit" | "delete"

export const ADMIN_RIGHTS: Record<AdminRight, number> = {
  read: 1 | 32,
  members: 2,
  admins: 4,
  info: 8,
  pin: 16,
  link: 128,
  post: 256,
  edit: 512,
  delete: 1024,
}

export const LIVE_CHATS = 10_000

export const MEMBERS_PAGE = 50

export const MEMBERS_READ = 5000

export const wireLink = (link: string): string => {
  const trimmed = link.trim()
  const at = trimmed.indexOf("join/")
  if (at >= 0 && trimmed.length > at + "join/".length) return trimmed.slice(at)
  if (/^(https:\/\/)?max\.ru\/[\w.-]+\/?$/.test(trimmed)) return trimmed
  throw new CliError("validation_error", "not a MAX link — expected https://max.ru/join/… or https://max.ru/<name>")
}

export const largestMp4 = (answer: Payload): string | undefined =>
  Object.entries(answer)
    .map(([key, value]) => ({ height: /^MP4_(\d+)$/.exec(key)?.[1], value }))
    .filter(
      (entry): entry is { height: string; value: string } =>
        entry.height !== undefined && typeof entry.value === "string",
    )
    .sort((a, b) => Number(b.height) - Number(a.height))[0]?.value

export interface PageRequest {
  limit?: number
  offset?: number
  /** Part of a name. Refused below three characters — see `checkedQuery`. */
  query?: string
  kind?: ChatKind
  /** Only chats MAX counts unread messages in; a chat where it did not say is not one of them. */
  unread?: boolean
}

export const MIN_QUERY = 3

export const checkedQuery = (query: string | undefined): string | undefined => {
  if (query === undefined) return undefined
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY) {
    throw new CliError(
      "validation_error",
      `a search needs at least ${MIN_QUERY} characters — "${trimmed}" is ${trimmed.length}`,
    )
  }
  return trimmed
}

export const CONTACT_INFO_BATCH = 100

export const CHATS_PAGE_SEEN = 26

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

export const HISTORY_PAGE = 100

export const EVENTS_READ = 2000

export const EVENTS_DAYS = 7

export interface TabSync {
  folders: number
  calls: number
  assets: Partial<Record<(typeof ASSET_TYPES)[number], number>>
}

export const ALL_CHATS_FOLDER = "all.chat.folder"

export const FIRST_TAB_SYNC: TabSync = { folders: 0, calls: 0, assets: {} }

export const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback)

export interface ResumeFrom {
  login: Resume
  chats: Payload[]
}

export const eventTime = (chat: unknown): number => {
  const time = record(chat)?.lastEventTime
  return typeof time === "number" ? time : 0
}

export const REACTIONS_CHANGED = 155

export const NEW_MESSAGE = 128

export const DELETE_AT_ONCE = 10

export const READ_MARK = 130

export const CHAT_CHANGED = 135

export const CONFIG_CHANGED = 134

export const CHAT_FACTS = ["title", "description", "participantsCount", "status", "type", "baseIconUrl", "owner"]

export const CHANGES_CHATS = new Set([140, 142])

export const isJoinRequest = (chat: Payload): boolean =>
  chat.joinRequestTime !== undefined && chat.joinRequestTime !== null

export const keyboardOf = (raw: Payload): Payload | undefined =>
  asArray(raw.attaches).find((attach) => attach._type === "INLINE_KEYBOARD")

export const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined

export const needsName = (message: Pick<Message, "senderId" | "senderName" | "outgoing">): boolean =>
  message.senderId !== null && message.senderName === null && message.outgoing !== true

export const batched = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = []
  for (let at = 0; at < items.length; at += size) batches.push(items.slice(at, at + size))
  return batches
}

export const matching = (
  chats: Chat[],
  { query, kind, unread }: Pick<PageRequest, "query" | "kind" | "unread">,
): Chat[] => {
  const needle = query?.toLocaleLowerCase()
  return chats.filter(
    (chat) =>
      (kind === undefined || chat.kind === kind) &&
      (!unread || (chat.unreadCount ?? 0) > 0) &&
      (needle === undefined || (chat.title ?? "").toLocaleLowerCase().includes(needle)),
  )
}

export const paged = <T>(items: T[], limit: number | undefined, offset: number): Page<T> => {
  const page = limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit)
  return { items: page, hasMore: offset + page.length < items.length }
}

export const asMarker = (time: unknown): number | undefined =>
  typeof time === "number" && Number.isFinite(time) && time > 0 ? time : undefined

export const reasonOf = (error: unknown): string => {
  const code = (error as { code?: unknown })?.code
  return typeof code === "string" ? code : error instanceof Error ? error.name : "an unknown problem"
}

export const viewer = (store: SessionStore) => {
  const viewerId = store.viewerId()
  return viewerId === undefined ? {} : { viewerId }
}

export const record = (value: unknown): Payload | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Payload) : undefined

export const asArray = (value: unknown): Payload[] =>
  Array.isArray(value) ? value.filter((item): item is Payload => record(item) !== undefined) : []

export const asCliError = (error: unknown): CliError => {
  if (error instanceof CliError) return error

  if (error instanceof ProtocolError) {
    const key = providerErrorKey(record(error.payload)?.error)
    const refused = asRefusal(error)
    return key === undefined
      ? refused
      : new CliError(refused.code, refused.message, { ...refused.details, provider_error: key })
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("did not answer")) return new CliError("timeout", message)
  return new CliError("network_error", message)
}

export const asRefusal = (error: ProtocolError): CliError => {
  const text = error.message.toLowerCase()
  // First: "too many auth attempts" is a limit, not a bad token. The words are claims —
  // `error.limit.violate` from PyMax #106, `rate_limit_exceeded` from GREEN-API — never measured here.
  if (LIMIT_WORDS.some((words) => text.includes(words))) {
    return new CliError("rate_limited", error.message, { operation: String(error.opcode) })
  }
  if (text.includes("token") || text.includes("auth")) {
    return new CliError(
      "authentication_error",
      `${error.message} — the session may have expired; run \`max <profile> session start\`, or sign in from WireCat Desktop (Tools → MAX → Manage)`,
    )
  }
  return new CliError("provider_error", error.message, { operation: String(error.opcode) })
}

export const deadLink =
  (link: string) =>
  (error: unknown): never => {
    const failure = asCliError(error)
    if (failure.details.provider_error !== "not.found") throw failure
    throw new CliError("not_found", `${link.trim()} leads nowhere — the link was reset, or never worked`)
  }

export const LIMIT_WORDS = ["limit.violate", "rate_limit", "rate limit", "too many", "слишком много"]

export const refuseWhilePaused = (state: SessionState): void => {
  const until = loginPausedUntil(state)
  if (until === undefined) return
  throw new CliError(
    "rate_limited",
    `MAX refused this profile's last login for too many attempts; it will not try again before ${shownTime(until)} — ` +
      "logging in sooner is what keeps an account locked",
  )
}

export type ContactWire =
  | { action: "ADD" | "REMOVE" | "BLOCK" | "UNBLOCK" }
  | { action: "UPDATE"; firstName: string; lastName: string | null }

export interface ProfileChange {
  firstName?: string
  lastName?: string
  description?: string
  /** Uploaded first, so a failed upload leaves the profile as it was. */
  photo?: string | SharedUpload
}

export interface FolderChange {
  title?: string
  add?: string[]
  remove?: string[]
}

export interface PhoneBookEntry {
  phone: string
  name: string
}

export const ownNames = (profile: Payload): { firstName?: string; lastName?: string } => {
  const contact = record(profile.contact) ?? profile
  const names = asArray(contact.names)
  const own = names.find((entry) => entry.type === "ONEME") ?? names[0]
  return {
    ...(typeof own?.firstName === "string" && own.firstName !== "" ? { firstName: own.firstName } : {}),
    ...(typeof own?.lastName === "string" ? { lastName: own.lastName } : {}),
  }
}

export const wirePhone = (typed: string): string => {
  const compact = typed.replace(/[\s()-]/g, "")
  const digits = compact.replace(/^\+/, "")
  if (!/^\d{7,15}$/.test(digits)) {
    throw new CliError("validation_error", "a phone number is 7 to 15 digits, with an optional + and the country code")
  }
  // A Russian number written the domestic way would otherwise go out as +8…, somebody else's.
  if (!compact.startsWith("+") && /^8\d{10}$/.test(digits)) {
    throw new CliError("validation_error", "write a number that starts with 8 with its country code instead: +7…")
  }
  return `+${digits}`
}

export const FOLDER_TITLE_MAX = 20

export const folderTitle = (title: string): string => {
  const trimmed = title.trim()
  if (trimmed === "") throw new CliError("validation_error", "a folder needs a title")
  if ([...trimmed].length > FOLDER_TITLE_MAX) {
    throw new CliError("validation_error", `a folder title is at most ${FOLDER_TITLE_MAX} characters in MAX`)
  }
  return trimmed
}

export const pickFolder = (reference: string, folders: Payload[]): Payload => {
  const wanted = reference.trim()
  const byId = folders.find((folder) => folder.id === wanted)
  if (byId) return byId
  const named = folders.filter((folder) => typeof folder.title === "string" && folder.title === wanted)
  if (named.length === 1 && named[0]) return named[0]
  if (named.length > 1) {
    throw new CliError(
      "validation_error",
      `${named.length} folders are called "${wanted}" — name one by id (\`max chats folders list\`)`,
    )
  }
  throw new CliError("not_found", `no folder "${wanted}" — \`max chats folders list\` shows them`)
}

export const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []

export const MEDIA_TYPES = { photo: "PHOTO", video: "VIDEO", file: "FILE", audio: "AUDIO", link: "SHARE" } as const
