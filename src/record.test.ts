import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { MaxClient } from "./client.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { Connection } from "./protocol/connection.js"
import { maxRecord } from "./record.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const ME = "10000001"
const login = {
  profile: { contact: { id: Number(ME), names: [{ name: "Test Person", type: "FULL_NAME" }] } },
  chats: [
    { id: 111, title: "First", type: "CHAT", lastEventTime: 1789776000000, participants: { [ME]: 0, 10000002: 0 } },
    { id: 222, type: "DIALOG", lastEventTime: 1789776000000, participants: { [ME]: 0, 10000002: 0 } },
  ],
  contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
  time: 1_789_776_000_000,
}

/** Over `max serve` the login is the server's, and the connection says so. */
class Served extends Connection {
  get journals(): boolean {
    return true
  }
}

const setUp = () => {
  const dir = mkdtempSync(join(tmpdir(), "max-record-"))
  const env = { MESSAGING_STORE: join(dir, "messages.db") }
  const session = new SessionStore({ keyring: memoryKeyring(), configDir: dir, stateDir: join(dir, "state"), env: {} })
  session.writeToken("a-token")
  const loginOnce = async (served = false) => {
    const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: login } })
    const record = maxRecord({ account: () => session.readState().viewerId, env })
    const Wire = served ? Served : Connection
    const client = new MaxClient({
      store: session,
      record,
      connection: new Wire({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: () => {},
    })
    await client.chats.list()
    await client.close()
    await record.close()
    return max.sent.find((call) => call.opcode === Opcode.LOGIN)?.payload
  }
  return { env, loginOnce }
}

describe("the record", () => {
  it("keeps the login's chats, people, members and marker in messages.db, under this account only", async () => {
    const { env, loginOnce } = setUp()

    await loginOnce()

    const store = await openStore({ env })
    const key = { provider: "max", account: ME }
    expect((await store.chats(key, {})).items.map((chat) => chat.id).sort()).toEqual(["111", "222"])
    expect((await store.members(key, "111")).map((member) => member.name)).toEqual(["Someone Else"])
    expect((await store.syncState(key, "login.marker"))?.value).toBe("1789776000000")
    expect((await store.chats({ provider: "max", account: "99" }, {})).items).toEqual([])
    await store.close()
  })

  it("logs in with the marker it kept", async () => {
    const { loginOnce } = setUp()

    expect((await loginOnce())?.contactsSync).toBe(0)
    expect((await loginOnce())?.contactsSync).toBe(1_789_776_000_000)
  })

  it("keeps the chats of a login `max serve` made, but not its marker", async () => {
    const { env, loginOnce } = setUp()

    await loginOnce(true)

    const store = await openStore({ env })
    const key = { provider: "max", account: ME }
    expect((await store.chats(key, {})).items).toHaveLength(2)
    expect(await store.syncState(key, "login.marker")).toBeUndefined()
    await store.close()
  })
})
