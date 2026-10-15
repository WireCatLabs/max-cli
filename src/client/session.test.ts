import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it, vi } from "vitest"
import { MaxClient } from "../client.js"
import { Opcode } from "../generated/opcodes.generated.js"
import type { Wire } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import { maxRecord } from "../record.js"
import { LOGIN_CHATS } from "../session/handshake.js"
import { SessionStore } from "../session/store.js"

const gate = () => {
  let release: () => void = () => {}
  let enter: () => void = () => {}
  return {
    released: new Promise<void>((resolve) => {
      release = resolve
    }),
    entered: new Promise<void>((resolve) => {
      enter = resolve
    }),
    release: () => release(),
    enter: () => enter(),
  }
}
const login = (account = 10000001, chats: Payload[] = []) => ({
  profile: { contact: { id: account, names: [{ name: "Synthetic Person", type: "FULL_NAME" }] } },
  contacts: [],
  chats,
})
let fixtures = 0
const fixture = (answer: Payload, paging = async (): Promise<Payload> => ({ chats: [] })) => {
  const store = new SessionStore({ profile: `session-race-${fixtures++}`, keyring: memoryKeyring() })
  store.writeToken("synthetic token")
  const invoke = vi.fn(async (opcode: number): Promise<Payload> => {
    if (opcode === Opcode.SESSION_INIT) return {}
    if (opcode === Opcode.LOGIN) return answer
    if (opcode === Opcode.CHATS_LIST) return await paging()
    throw new Error(`unexpected synthetic opcode ${opcode}`)
  })
  const connection: Wire = { open: async () => {}, close: async () => {}, invoke }
  return { store, connection, invoke }
}

describe("client session initialization", () => {
  it("a late resource read waits for login pagination and cannot inspect provisional data", async () => {
    const pagination = gate()
    const chats = Array.from({ length: LOGIN_CHATS }, (_, i) => ({
      id: 100 + i,
      type: "CHAT",
      lastEventTime: 1000 - i,
    }))
    const { store, connection } = fixture(login(10000001, chats), async () => {
      pagination.enter()
      await pagination.released
      return { chats: [{ id: 999, type: "CHAT", lastEventTime: 1 }] }
    })
    const client = new MaxClient({ store, connection, now: () => Date.parse("2026-10-01T12:00:00Z") })
    try {
      const connecting = client.connect()
      await pagination.entered
      let completed = false
      const read = client.chats.list().then((page) => {
        completed = true
        return page
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(completed).toBe(false)
      expect(() => client.live.snapshot()).toThrow("still initializing")
      pagination.release()
      await connecting
      expect((await read).items.some((chat) => chat.id === "999")).toBe(true)
      expect(store.readState().lastLoginAt).toBe("2026-10-01T12:00:00.000Z")
    } finally {
      pagination.release()
      await client.close()
    }
  })

  it("a late read waits for login ingestion into the store", async () => {
    const ingestion = gate()
    const { store, connection } = fixture(login())
    const record = {
      ...maxRecord({ account: () => undefined }),
      syncMarker: async () => undefined,
      applyLogin: async () => {
        ingestion.enter()
        await ingestion.released
        return undefined
      },
    }
    const client = new MaxClient({ store, connection, record })
    try {
      const connecting = client.connect()
      await ingestion.entered
      let completed = false
      const read = client.account.me().then((profile) => {
        completed = true
        return profile
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(completed).toBe(false)
      ingestion.release()
      await connecting
      expect((await read).id).toBe("10000001")
    } finally {
      ingestion.release()
      await client.close()
      await record.close()
    }
  })

  it("closing during optional ingestion cannot publish a ready session", async () => {
    const ingestion = gate()
    const { store, connection } = fixture(login())
    const record = {
      ...maxRecord({ account: () => undefined }),
      syncMarker: async () => undefined,
      applyLogin: async () => {
        ingestion.enter()
        await ingestion.released
        return undefined
      },
    }
    const client = new MaxClient({ store, connection, record })
    try {
      const connecting = client.connect().catch((error: unknown) => error)
      await ingestion.entered
      const read = client.account.me().catch((error: unknown) => error)
      await client.close()
      ingestion.release()
      expect(await connecting).toMatchObject({ code: "network_error", message: "the client is closed" })
      expect(await read).toMatchObject({ code: "network_error", message: "the client is closed" })
    } finally {
      ingestion.release()
      await client.close()
      await record.close()
    }
  })

  it("a rejected account leaves no initialized session for the next resource call", async () => {
    const { store, connection, invoke } = fixture(login(10000002))
    store.writeState({ ...store.readState(), viewerId: "10000001" })
    const client = new MaxClient({ store, connection })
    try {
      await expect(client.connect()).rejects.toThrow("different account")
      await expect(client.account.me()).rejects.toThrow("different account")
      expect(invoke.mock.calls.filter(([opcode]) => opcode === Opcode.LOGIN)).toHaveLength(2)
      expect(store.readState().viewerId).toBe("10000001")
      expect(store.readState().logins).toBe(0)
    } finally {
      await client.close()
    }
  })

  it("keeps the login state and rotated token when closed while MAX answers the login", async () => {
    const answering = gate()
    const { store, connection, invoke } = fixture({ ...login(), token: "rotated token" })
    invoke.mockImplementation(async (opcode: number): Promise<Payload> => {
      if (opcode === Opcode.SESSION_INIT) return {}
      if (opcode === Opcode.LOGIN) {
        answering.enter()
        await answering.released
        return { ...login(), token: "rotated token" }
      }
      return { chats: [] }
    })
    const client = new MaxClient({ store, connection })
    const connecting = client.connect()
    await answering.entered
    const closing = client.close()
    answering.release()
    await expect(connecting).rejects.toMatchObject({ code: "network_error" })
    await closing
    expect(store.readState().logins).toBe(1)
    expect(store.readToken()).toBe("rotated token")
  })
})
