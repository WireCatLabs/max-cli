/**
 * What does a bot's inline keyboard look like to a personal account? Run by hand, never by CI.
 *
 *   MAX_BOT_PROFILE=test2 MAX_PROFILE=mila pnpm probe:keyboard <chat>
 *
 * The bot sends one message with three buttons — callback, link, message — to <chat> (an id the
 * bot and the personal profile share). The personal profile reads that chat's newest messages and
 * prints the structure of every attach that is not text: key names, value types and `type` values.
 * Never button text, payloads, urls or ids. Then the bot deletes its message.
 */
import { BotTokenStore } from "../dist/bot/auth.js"
import { BotApiClient, botOperations } from "../dist/bot/client.js"
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"
import { chatsHistory } from "../dist/spec/operations/chats.js"

const chatId = process.argv[2]
if (!chatId) {
  console.error("usage: pnpm probe:keyboard <chat id the bot and the personal profile share>")
  process.exit(2)
}
const bot = new BotTokenStore({ profile: process.env.MAX_BOT_PROFILE ?? "test2" }).read()
const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "mila" })
const token = store.readToken()
if (!bot || !token) {
  console.error("needs a bot token on MAX_BOT_PROFILE and a session on MAX_PROFILE")
  process.exit(2)
}

const operation = (id: string) => {
  const found = botOperations.find((one) => one.id === id)
  if (!found) throw new Error(`the manifest has no ${id}`)
  return found
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const PRIVATE = new Set(["text", "payload", "url", "link", "callbackId", "id", "name", "title", "contactId"])
const shapes = new Map<string, Set<string>>()
const walk = (value: unknown, path: string, key = ""): void => {
  const types = shapes.get(path) ?? new Set()
  const kind = Array.isArray(value) ? "array" : value === null ? "null" : typeof value
  types.add(key === "type" || key === "_type" ? `${kind} "${String(value)}"` : kind)
  shapes.set(path, types)
  if (PRIVATE.has(key) && typeof value !== "object") return
  if (Array.isArray(value)) for (const item of value) walk(item, `${path}[]`)
  else for (const [inner, child] of Object.entries(record(value) ?? {})) walk(child, `${path}.${inner}`, inner)
}

const api = new BotApiClient({ token: bot.token })
const sent = record(
  await api.call(operation("sendMessage"), {
    query: { chat_id: chatId },
    body: JSON.stringify({
      text: "max-cli keyboard probe",
      attachments: [
        {
          type: "inline_keyboard",
          payload: {
            buttons: [
              [
                { type: "callback", text: "callback", payload: "probe" },
                { type: "link", text: "link", url: "https://max.ru" },
              ],
              [{ type: "message", text: "message" }],
            ],
          },
        },
      ],
    }),
  }),
)
const mid = record(record(sent?.message)?.body)?.mid
console.log(`bot sent: ${typeof mid === "string" ? "yes" : "no mid in the answer"}`)

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (op, request) => connection.invoke(op.opcode, buildRequest(op, request))
try {
  await connection.open()
  await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 20 })
  const answer = await connection.invoke(
    chatsHistory.opcode,
    buildRequest(chatsHistory, {
      chatId,
      from: Date.now() + 60_000,
      forward: 0,
      backward: 5,
      forwardTime: 0,
      backwardTime: 0,
      itemType: "REGULAR",
      getChat: false,
      getMessages: true,
    }),
  )
  const messages = (Array.isArray(answer.messages) ? answer.messages : []).map(record)
  let attaches = 0
  for (const message of messages) {
    for (const attach of Array.isArray(message?.attaches) ? message.attaches : []) {
      attaches += 1
      walk(attach, "attach")
    }
    for (const key of Object.keys(message ?? {})) if (/keyboard|markup|button/i.test(key)) walk(message?.[key], key)
  }
  console.log(`personal read ${messages.length} messages, ${attaches} attaches\n`)
  for (const [path, types] of [...shapes].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${path}: ${[...types].join(" | ")}`)
  }
} finally {
  await connection.close()
  if (typeof mid === "string") {
    await api.call(operation("deleteMessage"), { query: { message_id: mid } })
    console.log("\nbot deleted its message")
  }
}
