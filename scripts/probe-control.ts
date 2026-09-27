/**
 * What do MAX's service messages (joined, left, added, removed…) look like? Run by hand, never by CI.
 *
 *   pnpm probe:control [chat id]
 *
 * Reads only: one login, one history request, nothing marked read. Without an id it takes the
 * group titled "max-cli probe members" (`NEED-315`) from the login's chats.
 *
 * Printed: for each kind of `CONTROL` attachment, its field names, the type of each field and the
 * value of `event` — never an id, a name or a message's text. Also the types of the chat's `owner`,
 * `admins` and `adminParticipants` in the login answer, which `max review --unanswered` relies on.
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
  console.error("usage: pnpm probe:control [chat id]")
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

const shape = (value: unknown): string => {
  if (Array.isArray(value)) return `array(${value.length}) of ${[...new Set(value.map(shape))].join("|") || "nothing"}`
  if (value === null) return "null"
  if (typeof value === "object") return `object{${Object.keys(value).sort().join(",")}}`
  return typeof value
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

  console.log(`chat type=${String(chat.type)} status=${String(chat.status)}`)
  for (const field of ["owner", "admins", "adminParticipants"]) {
    const value = chat[field]
    // Its keys are person ids, so only their count and the shape of the values.
    const described =
      field === "adminParticipants" && value !== undefined
        ? `object of ${Object.keys(record(value)).length} keyed by id, values ${[...new Set(Object.values(record(value)).map(shape))].join("|")}`
        : value === undefined
          ? "absent"
          : shape(value)
    console.log(`  ${field}: ${described}`)
  }

  const answer = await connection.invoke(49, {
    chatId: chat.id,
    from: Date.now(),
    forward: 0,
    backward: 200,
    getMessages: true,
  })
  const messages = (Array.isArray(answer.messages) ? answer.messages : []).map(record)
  console.log(`\nhistory: ${messages.length} messages`)

  const kinds = new Map<string, number>()
  for (const message of messages) {
    for (const attach of (Array.isArray(message.attaches) ? message.attaches : []).map(record)) {
      if (attach._type !== "CONTROL") continue
      const fields = Object.keys(attach)
        .sort()
        .map((key) => `${key}:${key === "event" ? JSON.stringify(attach.event) : shape(attach[key])}`)
        .join(", ")
      const line = `  message fields: ${Object.keys(message).sort().join(",")}\n  control: ${fields}`
      kinds.set(line, (kinds.get(line) ?? 0) + 1)
    }
  }
  console.log(`control attachments: ${[...kinds.values()].reduce((sum, n) => sum + n, 0)}`)
  for (const [line, count] of kinds) console.log(`\n×${count}\n${line}`)
} catch (error) {
  console.log(`failed: ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await connection.close()
}
