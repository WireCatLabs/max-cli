/**
 * Does MAX tell a reader how many people saw, forwarded or commented on a channel post? Run by hand, never by CI.
 *
 *   pnpm probe:channel-posts <chatId> [messages=50]
 *
 * Reads one page of the chat's history (reading never marks read) and its entry in the login's chat list.
 * **It prints no content**: every key path with its value types, and only the values of `type` and `status`
 * fields. Numeric keys print as `<id>`; nothing under a text, name, title, url or link key is opened.
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"
import { chatsHistory } from "../dist/spec/operations/chats.js"

const chatId = process.argv[2]
const messageLimit = Number(process.argv[3] ?? 50)
if (!chatId) {
  console.error("usage: pnpm probe:channel-posts <chatId> [messages]")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const typeOf = (value: unknown): string => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value)
const PRIVATE = new Set(["text", "name", "title", "url", "baseUrl", "description", "phone", "link", "names"])
const LABELLED = new Set(["type", "status", "_type"])

const shapes = new Map<string, { types: Set<string>; count: number; labels: Set<string> }>()
const walk = (value: unknown, path: string, key = ""): void => {
  const seen = shapes.get(path) ?? { types: new Set(), count: 0, labels: new Set() }
  seen.types.add(typeOf(value))
  seen.count += 1
  if (LABELLED.has(key) && typeof value === "string" && /^[A-Z_]{1,32}$/.test(value)) seen.labels.add(value)
  shapes.set(path, seen)
  if (PRIVATE.has(key)) return
  if (Array.isArray(value)) {
    for (const item of value) walk(item, `${path}[]`)
    return
  }
  const object = record(value)
  if (!object) return
  for (const [inner, child] of Object.entries(object))
    walk(child, `${path}.${/^-?\d+$/.test(inner) ? "<id>" : inner}`, inner)
}

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))

try {
  await connection.open()
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 100 })
  const chat = (Array.isArray(login.chats) ? login.chats : []).map(record).find((one) => asId(one?.id) === chatId)
  if (chat) walk(chat, "chat")
  const answer = await connection.invoke(
    chatsHistory.opcode,
    buildRequest(chatsHistory, {
      chatId,
      from: Date.now(),
      forward: 0,
      backward: messageLimit,
      forwardTime: 0,
      backwardTime: 0,
      itemType: "REGULAR",
      getChat: false,
      getMessages: true,
    }),
  )
  const messages = Array.isArray(answer.messages) ? answer.messages : []
  for (const message of messages) walk(message, "message")
  console.log(`chat in the login's list: ${chat ? "yes" : "no"}; messages read: ${messages.length}\n`)
  console.log("path — value types — times seen — labels")
  for (const [path, { types, count, labels }] of [...shapes].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${path}: ${[...types].join(" | ")} ×${count}${labels.size ? `  ${[...labels].join(" ")}` : ""}`)
  }
} finally {
  await connection.close()
}
