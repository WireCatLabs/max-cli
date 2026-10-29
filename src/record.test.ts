import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
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
  const session = new SessionStore({
    profile: "default",
    keyring: memoryKeyring(),
    configDir: dir,
    stateDir: join(dir, "state"),
    env: {},
  })
  session.writeToken("a-token")
  const loginOnce = async (
    served = false,
    act: (client: MaxClient) => Promise<unknown> = (client) => client.chats.list(),
    chats = login.chats,
  ) => {
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...login, chats }, [Opcode.CONTACT_UPDATE]: {} },
    })
    const record = maxRecord({ account: () => session.readState().viewerId, env })
    const Wire = served ? Served : Connection
    const client = new MaxClient({
      store: session,
      record,
      connection: new Wire({ createSocket: max.createSocket, timeoutMs: 50 }),
      warn: () => {},
    })
    try {
      await act(client)
    } finally {
      await client.close()
      await record.close()
    }
    return max.sent.find((call) => call.opcode === Opcode.LOGIN)?.payload
  }
  return { env, loginOnce }
}

describe("the record", () => {
  it("opens transcript storage only once the account is known, and keeps it after login", async () => {
    const { env } = setUp()
    let account: string | undefined
    const record = maxRecord({ account: () => account, env })

    expect(await record.transcript("111", "2")).toBeUndefined()
    expect(existsSync(env.MESSAGING_STORE)).toBe(false)
    await expect(record.keepTranscript("111", "2", "words", "tiny")).rejects.toThrow(/account is known/)
    account = ME
    await record.keepTranscript("111", "2", "words", "tiny")
    expect(await record.transcript("111", "2")).toEqual({ text: "words", source: "tiny" })
    await record.close()
  })

  it("keeps the login's chats, people, members and marker in messages.db, under this account only", async () => {
    const { env, loginOnce } = setUp()

    await loginOnce()

    const store = await openStore({ env })
    const key = { provider: "max", account: ME }
    expect((await store.chats.chats(key, {})).items.map((chat) => chat.id).sort()).toEqual(["111", "222"])
    expect((await store.roster.members(key, "111")).map((member) => member.name)).toEqual(["Someone Else"])
    expect((await store.sync.syncState(key, "login.marker"))?.value).toBe("1789776000000")
    expect((await store.chats.chats({ provider: "max", account: "99" }, {})).items).toEqual([])
    await store.close()
  })

  it("titles a dialog with its partner's contact name, so a title search finds it offline", async () => {
    const { env, loginOnce } = setUp()
    const key = { provider: "max", account: ME }
    const titles = async () => {
      const store = await openStore({ env })
      const items = (await store.chats.chats(key, {})).items
      await store.close()
      return items.map((chat) => [chat.id, chat.title])
    }

    await loginOnce(false, (client) => client.chats.partner("222"))
    expect(await titles()).toContainEqual(["222", "Someone Else"])

    const store = await openStore({ env })
    await store.chats.saveChats(key, [
      { id: "222", title: null, kind: "dialog", unreadCount: null, lastMessageAt: null, participantsCount: null },
    ])
    await store.close()
    await loginOnce(false, (client) => client.chats.partner("222"))
    expect(await titles()).toContainEqual(["222", "Someone Else"])
  })

  it("resolves a contact name under this account, without the legacy cache", async () => {
    const { env, loginOnce } = setUp()
    const other = maxRecord({ account: () => "99", env })
    await other.remember([
      { id: "10000002", name: "Foreign Name", username: null, description: null, lastMessagedAt: null },
    ])
    await other.close()

    await loginOnce(false, async (client) => {
      expect(await client.contacts.show("Someone")).toMatchObject({
        id: "10000002",
        name: "Someone Else",
        chats: [{ id: "111" }, { id: "222" }],
      })
      await expect(client.contacts.rename("Foreign Name", "Renamed")).rejects.toMatchObject({ code: "not_found" })
      expect(await client.contacts.rename("Someone", "Renamed")).toMatchObject({ id: "10000002", name: null })
    })
  })

  it("a full sync clears the shared marker and reports people counts without a cache", async () => {
    const { loginOnce } = setUp()
    await loginOnce(false, async (client) => {
      expect(await client.contacts.sync()).toEqual({ known: 1, added: 1, changed: 0, full: true })
    })
    const payload = await loginOnce(false, async (client) => {
      expect(await client.contacts.sync()).toEqual({ known: 1, added: 0, changed: 1, full: true })
    })
    expect(payload?.contactsSync).toBe(0)
    expect((await loginOnce())?.contactsSync).toBe(login.time)
  })

  it("a complete chat snapshot marks departures, while an empty one keeps the last snapshot", async () => {
    const { env, loginOnce } = setUp()
    await loginOnce()
    await loginOnce(
      false,
      async (client) => {
        expect((await client.chats.list()).items.map((chat) => chat.id)).toEqual(["111", "222"])
      },
      [],
    )
    await loginOnce(
      false,
      async (client) => {
        expect((await client.chats.show("First")).members).toMatchObject([{ id: "10000002", name: "Someone Else" }])
        expect((await client.chats.list()).items.map((chat) => chat.id)).toEqual(["111"])
      },
      login.chats.slice(0, 1),
    )
    const store = await openStore({ env })
    expect(await store.chats.leftChats({ provider: "max", account: ME })).toEqual({
      chats: 1,
      messages: 0,
      left: [expect.objectContaining({ messages: 0 })],
    })
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
    expect((await store.chats.chats(key, {})).items).toHaveLength(2)
    expect(await store.sync.syncState(key, "login.marker")).toBeUndefined()
    await store.close()
  })

  describe("rejoining chats the owner is back in", () => {
    const key = { provider: "max", account: ME }
    const other = { provider: "max", account: "10000009" }
    const chat = (id: string) => ({
      id,
      title: `Chat ${id}`,
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    })
    const seeded = async () => {
      const { env } = setUp()
      const store = await openStore({ env })
      await store.chats.saveChats(key, [
        { ...chat("111"), membershipState: "left" },
        { ...chat("222"), membershipState: "archived" },
        chat("333"),
      ])
      await store.chats.saveChats(other, [{ ...chat("111"), membershipState: "left" }])
      await store.close()
      return { env, record: maxRecord({ account: () => ME, env }) }
    }
    const states = async (env: { MESSAGING_STORE: string }) => {
      const store = await openStore({ env })
      const left = await store.chats.leftChats(key)
      const all = (await store.chats.chats(key, {})).items
      const otherLeft = await store.chats.leftChats(other)
      await store.close()
      return {
        left: left.chats,
        otherLeft: otherLeft.chats,
        listed: all.map((stored) => [stored.id, stored.membershipState]),
      }
    }

    it("a cut-short list takes the left mark off a chat it names and keeps the archived one", async () => {
      const { env, record } = await seeded()
      const known = await record.rememberChats([chat("111"), chat("222")], false)
      await record.close()

      expect(known.map((stored) => stored.id).sort()).toEqual(["111", "222", "333"])
      expect(await states(env)).toMatchObject({
        left: 0,
        otherLeft: 1,
        listed: expect.arrayContaining([["222", "archived"]]),
      })
    })

    it("a complete list still marks the chats it leaves out as left", async () => {
      const { env, record } = await seeded()
      const known = await record.rememberChats([chat("111"), chat("222")], true)
      await record.close()

      expect(known.map((stored) => stored.id).sort()).toEqual(["111", "222"])
      expect(await states(env)).toMatchObject({ left: 1, listed: expect.arrayContaining([["222", "archived"]]) })
    })

    it("a login takes the left mark off the chats it names and keeps the archived one", async () => {
      const { env, record } = await seeded()
      await record.applyLogin({ chats: [chat("111"), chat("222")], people: [], members: new Map() })
      await record.close()

      expect(await states(env)).toMatchObject({
        left: 0,
        otherLeft: 1,
        listed: expect.arrayContaining([["222", "archived"]]),
      })
    })
  })
})
