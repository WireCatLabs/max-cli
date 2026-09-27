/**
 * Does opcode 59 list a group's members as PyMax sends it? Run by hand, never by CI.
 *
 *   pnpm probe:member-list [chat id]
 *
 * Reads only, and sends the request **once** (`{type: "MEMBER", chatId, marker: 0, count: 50}`,
 * PyMax `GetChatMembersPayload`, 53103f0) — owner's word 2026-09-27. Without an id it takes the
 * group titled "max-cli probe members" from the login's chats.
 *
 * Printed: field names, value types and counts — never an id or a name. Maps keyed by id are
 * counted, not listed.
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const TITLE = "max-cli probe members"
const wanted = process.argv[2]
if (wanted !== undefined && !/^-?\d+$/.test(wanted)) {
  console.error("usage: pnpm probe:member-list [chat id]")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const DIGITS = /^-?\d+$/

const shape = (value: unknown, depth = 0): string => {
  if (Array.isArray(value)) {
    return `array(${value.length}) of ${[...new Set(value.map((item) => shape(item, depth + 1)))].join(" | ") || "nothing"}`
  }
  if (value === null) return "null"
  if (typeof value !== "object") return typeof value
  const keys = Object.keys(value)
  if (keys.length > 0 && keys.every((key) => DIGITS.test(key))) return `object of ${keys.length} keyed by id`
  if (depth > 2) return `object{${keys.sort().join(",")}}`
  return `{${keys
    .sort()
    .map((key) => `${key}: ${shape((value as Record<string, unknown>)[key], depth + 1)}`)
    .join(", ")}}`
}

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))

try {
  await connection.open()
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 100 })
  const chats = (Array.isArray(login.chats) ? login.chats : []).map(record)
  const chat = chats.find((one) => (wanted ? asId(one.id) === wanted : one.title === TITLE))
  if (!chat) {
    console.log(
      wanted ? "that chat is not among the login's 100 chats" : `no chat titled "${TITLE}" in the login's 100 chats`,
    )
    process.exit(1)
  }
  console.log(`chat type=${String(chat.type)} participantsCount=${String(chat.participantsCount)}`)

  const answer = await connection.invoke(59, { type: "MEMBER", chatId: chat.id, marker: 0, count: 50 })
  console.log(`\nanswer: ${shape(answer)}`)
  const members = Array.isArray(answer.members) ? answer.members : []
  console.log(
    `members: ${members.length}; marker ${answer.marker === undefined ? "absent" : `${typeof answer.marker}, zero: ${Number(answer.marker) === 0}`}`,
  )
} catch (error) {
  console.log(`failed: ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await connection.close()
}
