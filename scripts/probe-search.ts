/**
 * Does MAX's server search message text? Opcode 73 (`MSG_SEARCH` in PyMax `53103f0`
 * `src/pymax/protocol/enums.py:72`) is named by three sources and called by none. Run by hand, never by CI.
 *
 *   pnpm probe:search <word> [more words…]
 *
 * Each word is asked in Saved messages (chat 0) as `{chatId, query, count}`, then once without
 * `chatId`. **It prints no content**: per request, whether it was answered, the answer's key names and
 * value types, and how many results came back.
 */

import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const MSG_SEARCH = 73
const words = process.argv.slice(2)
if (!words.length) {
  console.error("usage: pnpm probe:search <word> [more words…]")
  process.exit(2)
}

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

const typeOf = (value: unknown): string => (Array.isArray(value) ? "array" : value === null ? "null" : typeof value)
const shape = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.entries(value)
        .map(([key, one]) => `${key}: ${typeOf(one)}${Array.isArray(one) ? `[${one.length}]` : ""}`)
        .join(", ")
    : typeOf(value)

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))

const ask = async (label: string, payload: Record<string, unknown>) => {
  try {
    const answer = await connection.invoke(MSG_SEARCH, payload)
    const result = (answer as { result?: unknown[] }).result
    const first = Array.isArray(result) ? result[0] : undefined
    console.log(`${label}: answered { ${shape(answer)} }`)
    if (first !== undefined) console.log(`  result[0]: { ${shape(first)} }`)
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string }
    console.log(`${label}: refused (${code ?? "error"}${message ? `: ${message.slice(0, 80)}` : ""})`)
  }
}

try {
  await connection.open()
  await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 1 })
  for (const [index, word] of words.entries())
    await ask(`word ${index + 1} in Saved`, { chatId: 0n, query: word, count: 10 })
  await ask("word 1 without chatId", { query: words[0], count: 10 })
} finally {
  await connection.close()
}
