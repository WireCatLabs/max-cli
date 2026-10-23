/**
 * What do opcodes 68 and 60 search? Run by hand, never by CI (`MAX-71`).
 *
 *   MAX_PROFILE=mila pnpm probe:search-ops <query>
 *
 * Sends what web.max.ru sends — 68 `{query, count, marker}` and 60 `{query, count: 40, type: ALL}` —
 * and prints key names, value types, `type`/`section` values and counts. Never text, names or ids.
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const query = process.argv[2]
if (!query) {
  console.error("usage: pnpm probe:search-ops <query>")
  process.exit(2)
}
const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "mila" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile")
  process.exit(2)
}

const paths = new Map<string, Set<string>>()
const walk = (value: unknown, path: string, key = ""): void => {
  const kinds = paths.get(path) ?? new Set()
  const kind = Array.isArray(value) ? `array ×${value.length}` : value === null ? "null" : typeof value
  kinds.add(
    key === "type" || key === "_type" || key === "status" || key === "section" ? `${kind} = ${String(value)}` : kind,
  )
  paths.set(path, kinds)
  if (Array.isArray(value)) for (const item of value) walk(item, `${path}[]`)
  else if (typeof value === "object" && value !== null)
    for (const [inner, child] of Object.entries(value)) {
      if (path.split(".").length > 4) continue
      walk(child, `${path}.${/^-?\d+$/.test(inner) ? "<id>" : inner}`, inner)
    }
}

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))
try {
  await connection.open()
  await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 20 })
  type Hit = { section?: string; chatId?: unknown; message?: unknown }
  const tally = (label: string, answer: { result?: Hit[]; marker?: unknown }) => {
    const hits = answer.result ?? []
    const messages = hits.filter((hit) => hit.section === "MESSAGES" && hit.message)
    const chats = new Set(messages.map((hit) => String(hit.chatId)))
    console.log(
      `${label}: ${hits.length} results, ${messages.length} message hits from ${chats.size} chats, marker ${answer.marker === undefined ? "absent" : "present"}`,
    )
  }
  try {
    const first = (await connection.invoke(68, { query, count: 30 })) as { result?: Hit[]; marker?: unknown }
    walk(first, "68")
    tally("68 page 1", first)
    if (first.marker !== undefined) {
      const second = (await connection.invoke(68, { query, count: 30, marker: first.marker })) as {
        result?: Hit[]
        marker?: unknown
      }
      walk(second, "68")
      tally("68 page 2", second)
    }
  } catch (error) {
    console.log(`68 refused: ${(error as Error).message.replace(/\d{5,}/g, "<id>")}`)
  }
  try {
    walk(await connection.invoke(60, { query, count: 40, type: "ALL" }), "60")
  } catch (error) {
    console.log(`60 refused: ${(error as Error).message.replace(/\d{5,}/g, "<id>")}`)
  }
  for (const [path, kinds] of [...paths].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`  ${path}: ${[...kinds].join(" | ")}`)
} finally {
  await connection.close()
}
