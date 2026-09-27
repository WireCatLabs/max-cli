/**
 * Which bits of an admin's `permissions` mean what? Run by hand, never by CI.
 *
 *   pnpm probe:admin-rights <user id>
 *
 * Reads only: one login. Prints, for the admin with this id in the group «max-cli probe members»,
 * the `permissions` number and its bits — never a name or another id. Compare with the switches the
 * app shows for that admin (MAX-61).
 */
import type { Invoke } from "../dist/generated/client.generated.js"
import { Connection } from "../dist/protocol/connection.js"
import { startSession } from "../dist/session/handshake.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"

const admin = process.argv[2]
if (!admin || !/^\d+$/.test(admin)) {
  console.error("usage: pnpm probe:admin-rights <user id>")
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

const connection = new Connection({ timeoutMs: 20_000 })
const invoke: Invoke = (operation, request) => connection.invoke(operation.opcode, buildRequest(operation, request))
try {
  await connection.open()
  const login = await startSession(invoke, { token, deviceId: store.readState().deviceId, chatsCount: 100 })
  const chat = (Array.isArray(login.chats) ? login.chats : [])
    .map(record)
    .find((one) => one.title === "max-cli probe members")
  if (!chat) {
    console.log("the group is not among the login's chats")
    process.exit(1)
  }
  const entry = record(record(chat.adminParticipants)[admin])
  const permissions = Number(entry.permissions)
  if (!Number.isFinite(permissions)) {
    console.log("no permissions for this admin in the login's chat")
    process.exit(1)
  }
  const bits = [...Array(16).keys()].map((bit) => 2 ** bit).filter((value) => (permissions & value) !== 0)
  console.log(`permissions ${permissions} = ${bits.join(" + ")}`)
} finally {
  await connection.close()
}
