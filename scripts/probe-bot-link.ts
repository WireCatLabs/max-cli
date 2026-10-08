/**
 * Starting a bot the personal account never wrote to, as web.max.ru does from a link (`MAX-72`). Run
 * by hand, never by CI.
 *
 *   MAX_BOT_PROFILE=test2 MAX_PROFILE=mila pnpm probe:bot-link link    # 89 {link: https://max.ru/<bot>}
 *   MAX_BOT_PROFILE=test2 MAX_PROFILE=mila pnpm probe:bot-link start   # 64 botStarted to viewer ^ bot
 *   MAX_BOT_PROFILE=test2 MAX_PROFILE=mila pnpm probe:bot-link info    # 32 {contactIds: [bot]}
 *
 * The bot's name and id come from its own `me`. Prints key names, value types, `type`/`status`
 * values, and whether ids line up — never a name, a link or an id.
 */
import { BotTokenStore } from "../dist/bot/auth.js"
import { BotApiClient } from "../dist/bot/client.js"
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const step = process.argv[2]
if (step !== "link" && step !== "start" && step !== "info") {
  console.error("usage: pnpm probe:bot-link link|start|info")
  process.exit(2)
}
const bot = new BotTokenStore({ profile: process.env.MAX_BOT_PROFILE ?? "test2" }).read()
const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "mila" })
const token = store.readToken()
if (!bot || !token) {
  console.error("needs a bot token on MAX_BOT_PROFILE and a session on MAX_PROFILE")
  process.exit(2)
}
const me = (await new BotApiClient({ token: bot.token }).me()) as unknown as Record<string, unknown>
const botId = BigInt(String(me.user_id ?? me.id))
const username = String(me.username)

const SHOWN = new Set(["type", "status", "_type", "event", "options"])
const shape = (value: unknown, path: string, key = ""): string[] => {
  if (Array.isArray(value))
    return value.length === 0
      ? [`${path}: []`]
      : [`${path}: array ×${value.length}`, ...value.flatMap((item) => shape(item, `${path}[]`))]
  if (typeof value === "object" && value !== null)
    return Object.entries(value).flatMap(([inner, child]) =>
      shape(child, `${path}.${/^-?\d+$/.test(inner) ? "<id>" : inner}`, inner),
    )
  const shown = SHOWN.has(key) || path.endsWith(".options[]") ? ` = ${String(value)}` : ""
  return [`${path}: ${value === null ? "null" : typeof value}${shown}`]
}

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))
try {
  await connection.open()
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 40 })
  const viewer = BigInt(String((login.profile as { contact?: { id?: unknown } } | undefined)?.contact?.id))
  const dialog = viewer ^ botId
  const listed = (Array.isArray(login.chats) ? login.chats : []).some(
    (chat) => String((chat as { id?: unknown }).id) === String(dialog),
  )
  console.log(`the dialog viewer ^ bot is in the login's chat list: ${listed}`)
  if (step === "info") {
    const answer = await connection.invoke(32, { contactIds: [botId] })
    for (const line of shape(answer, "32").filter((line) => line.includes("options") || line.includes("flags")))
      console.log(`  ${line}`)
  } else if (step === "link") {
    const answer = await connection.invoke(89, { link: `https://max.ru/${username}` })
    const contactId = (answer.user as { contact?: { id?: unknown } } | undefined)?.contact?.id
    console.log(`user.contact.id is the bot's id: ${contactId !== undefined && BigInt(String(contactId)) === botId}`)
    for (const line of shape(answer, "89")) console.log(`  ${line}`)
  } else {
    const cid = Date.now()
    const control = { _type: "CONTROL", event: "botStarted", startPayload: "probe" }
    const answer = await connection.invoke(64, { chatId: dialog, message: { cid, attaches: [control] } })
    const chatId = (answer.chat as { id?: unknown } | undefined)?.id ?? answer.chatId
    console.log(`the answer's chat is viewer ^ bot: ${chatId !== undefined && BigInt(String(chatId)) === dialog}`)
    for (const line of shape(answer, "64").filter((line) => !line.includes(".text:"))) console.log(`  ${line}`)
  }
} catch (error) {
  console.log(`refused: ${(error as Error).message.replace(/\d{5,}/g, "<id>")}`)
} finally {
  await connection.close()
}
