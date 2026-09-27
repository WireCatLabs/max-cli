/**
 * Does MAX create a channel the way it creates a group, with `chatType: "CHANNEL"`? Run by hand, never by CI.
 *
 *   pnpm build && node --experimental-strip-types scripts/probe-channel.ts
 *
 * **One request, one channel, "max-cli live check channel", nobody else in it.** No reference client
 * shows how a channel is created (PyMax 53103f0 has `create_group` only), so this is the measurement:
 * the group's own request with the one word changed. Asked for by the owner on 2026-09-28. Printed:
 * field names, the chat's type and access, never the link.
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
const token = store.readToken()
if (!token) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const keys = (value: unknown) => Object.keys(record(value)).sort().join(", ")

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))

try {
  await connection.open()
  await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 100 })
  const answer = await connection.invoke(64, {
    message: {
      cid: Date.now(),
      attaches: [
        { _type: "CONTROL", event: "new", chatType: "CHANNEL", title: "max-cli live check channel", userIds: [] },
      ],
    },
    notify: false,
  })
  const chat = record(answer.chat)
  console.log(`answered: ${keys(answer)}`)
  console.log(`chat fields: ${keys(chat)}`)
  console.log(`type=${String(chat.type)} access=${String(chat.access)} id=${asId(chat.id) ?? "absent"}`)
} catch (error) {
  console.log(`refused: ${(error as Error).message}`)
} finally {
  await connection.close()
}
