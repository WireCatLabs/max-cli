/**
 * Do MAX groups take join requests? Run by hand, never by CI, on a throwaway group (`MAX-71`).
 *
 *   MAX_PROFILE=mila pnpm probe:join-requests on <chat>        # 55 {chatId, options: {JOIN_REQUEST: true}}
 *   MAX_PROFILE=mila pnpm probe:join-requests requests <chat>  # 59 {chatId, type: JOIN_REQUEST, count}
 *
 * Prints key names, value types and the values of `type`, `status` and option flags — never names,
 * links, ids or phones.
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const [step, chatId] = process.argv.slice(2)
if ((step !== "on" && step !== "requests") || !chatId) {
  console.error("usage: pnpm probe:join-requests on|requests <chat id>")
  process.exit(2)
}
const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "mila" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile")
  process.exit(2)
}

const SHOWN = new Set(["type", "status", "_type", "access"])
const shape = (value: unknown, path: string, key = ""): string[] => {
  if (Array.isArray(value))
    return value.length === 0 ? [`${path}: []`] : [`${path}: array ×${value.length}`, ...shape(value[0], `${path}[]`)]
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([inner, child]) =>
      shape(child, `${path}.${/^-?\d+$/.test(inner) ? "<id>" : inner}`, inner),
    )
  }
  const shown =
    SHOWN.has(key) || (path.includes(".options.") && typeof value === "boolean") ? ` = ${String(value)}` : ""
  return [`${path}: ${value === null ? "null" : typeof value}${shown}`]
}

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))
const id = BigInt(chatId)
try {
  await connection.open()
  await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 20 })
  const answer =
    step === "on"
      ? await connection.invoke(55, { chatId: id, options: { JOIN_REQUEST: true } })
      : await connection.invoke(59, { chatId: id, type: "JOIN_REQUEST", count: 50 })
  for (const line of shape(answer, step === "on" ? "55" : "59")) console.log(`  ${line}`)
} catch (error) {
  console.log(`refused: ${(error as Error).message.replace(/\d{5,}/g, "<id>")}`)
} finally {
  await connection.close()
}
