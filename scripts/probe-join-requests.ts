/**
 * Do MAX groups take join requests? Run by hand, never by CI, on a throwaway group (`MAX-71`).
 *
 *   MAX_PROFILE=mila pnpm probe:join-requests on <chat>        # 55 {chatId, options: {JOIN_REQUEST: true}}
 *   MAX_PROFILE=mila pnpm probe:join-requests requests <chat>  # 59 {chatId, type: JOIN_REQUEST, count}
 *   MAX_PROFILE=mila pnpm probe:join-requests off <chat>       # 55 {chatId, options: {JOIN_REQUEST: false}}
 *   MAX_PROFILE=mila pnpm probe:join-requests status <chat>    # the chat as this account's login lists it
 *   MAX_PROFILE=mila MAX_PROBE_LINK=<link> pnpm probe:join-requests join <chat>  # 57 {link}: what a request answers
 *   MAX_PROBE_USER=<id> pnpm probe:join-requests decline <chat>  # 77 {userIds, type: JOIN_REQUEST, operation: remove}
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
if (!["on", "off", "requests", "status", "join", "decline"].includes(step ?? "") || !chatId) {
  console.error("usage: pnpm probe:join-requests on|off|requests|status <chat id>")
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
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 100 })
  if (step === "status") {
    const chat = (Array.isArray(login.chats) ? login.chats : []).find(
      (one) => String((one as { id?: unknown }).id) === chatId,
    )
    console.log(chat ? "listed in the login" : "not in the login's chats")
    const { lastMessage, pinnedMessage, ...rest } = (chat ?? {}) as Record<string, unknown>
    for (const line of shape(rest, "chat")) console.log(`  ${line}`)
    process.exitCode = 0
  }
  const answer =
    step === "status"
      ? {}
      : step === "join"
        ? await connection.invoke(57, { link: process.env.MAX_PROBE_LINK ?? "" })
        : step === "decline"
          ? await connection.invoke(77, {
              chatId: id,
              userIds: [BigInt(process.env.MAX_PROBE_USER ?? "0")],
              type: "JOIN_REQUEST",
              operation: "remove",
            })
          : step === "on" || step === "off"
            ? await connection.invoke(55, { chatId: id, options: { JOIN_REQUEST: step === "on" } })
            : await connection.invoke(59, { chatId: id, type: "JOIN_REQUEST", count: 50 })
  const label = { requests: "59", join: "57", decline: "77" }[step ?? ""] ?? "55"
  for (const line of shape(answer, label)) console.log(`  ${line}`)
  const viewer = String((login.profile as { contact?: { id?: unknown } } | undefined)?.contact?.id)
  const participants = (answer as { chat?: { participants?: Record<string, unknown> } }).chat?.participants
  if (participants) console.log(`  the viewer is among the chat's participants: ${viewer in participants}`)
  if (process.env.MAX_PROBE_EXPECT) {
    const ids = JSON.stringify(answer).match(/"id":(\d+)/g) ?? []
    console.log(`  expected person among them: ${ids.some((one) => one.endsWith(`:${process.env.MAX_PROBE_EXPECT}`))}`)
  }
} catch (error) {
  console.log(`refused: ${(error as Error).message.replace(/\d{5,}/g, "<id>")}`)
} finally {
  await connection.close()
}
