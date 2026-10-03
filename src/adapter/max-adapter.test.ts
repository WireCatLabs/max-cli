import { memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { MaxClient } from "../client.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { Connection } from "../protocol/connection.js"
import type { Payload } from "../protocol/frame.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { maxAdapter, toMessage } from "./max-adapter.js"

const OWNER = 10000001
const MESSAGE = "116762160362694583"
const PHOTO = { _type: "PHOTO", photoId: 5, photoToken: "a-photo-token", baseUrl: "https://example.test/p" }
const FILE = { _type: "FILE", fileId: 77, name: "notes.pdf", size: 1200 }

let profiles = 0

const connected = (answers: Record<number, Payload | ((request: Payload) => Payload | undefined)> = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: OWNER, names: [{ name: "Owner", type: "ONEME" }] } },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: 1789776000000 }],
      },
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: BigInt(MESSAGE), time: 1789776000000, sender: OWNER, text: "old", attaches: [PHOTO, FILE] }],
      },
      [Opcode.MSG_SEND]: { message: { id: 116762160362694590n, time: 1789776100000, sender: OWNER, text: "hi" } },
      [Opcode.MSG_DELETE]: {},
      [Opcode.MSG_REACTION]: { reactionInfo: {} },
      [Opcode.MSG_CANCEL_REACTION]: { reactionInfo: {} },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHAT_UPDATE]: { chat: { id: 111 } },
      [Opcode.CHAT_MARK]: {},
      ...answers,
    },
  })
  const store = new SessionStore({ profile: `adapter-${profiles++}`, keyring: memoryKeyring() })
  store.writeToken("a-token")
  const client = new MaxClient({
    sends: "caller",
    store,
    connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    warn: () => {},
    sleep: async () => {},
  })
  const sent = (opcode: number) => max.sent.filter((one) => one.opcode === opcode).map(({ payload }) => payload)
  return { adapter: maxAdapter(client, store), client, store, sent }
}

describe("the MAX adapter", () => {
  it("resolves numeric people without connecting, so the shared contact guard can refuse first", async () => {
    const { adapter, sent } = connected()
    expect(await adapter.people([" 20000002 ", "20000003"])).toEqual(["20000002", "20000003"])
    expect(sent(Opcode.LOGIN)).toEqual([])
  })

  it("refuses explicit topics for direct send and poll calls without connecting", async () => {
    const { adapter, sent } = connected()
    const options = { sendId: "42", threadId: "12" }
    await expect(adapter.send("111", "hi", options)).rejects.toThrow("does not support forum topic addressing")
    await expect(
      adapter.createPoll(
        "111",
        { question: "Friday?", answers: ["yes", "no"], multiple: false, anonymous: true, revote: false },
        options,
      ),
    ).rejects.toThrow("does not support forum topic addressing")
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(sent(Opcode.MSG_SEND)).toEqual([])
  })

  it("formats MAX underline and links with their personal wire attributes", async () => {
    const { adapter, client, sent } = connected()
    try {
      const formatted = await adapter.formatMarkdown?.("__b__ ++u++ [l](https://example.test)")
      expect(formatted).toBeDefined()
      await adapter.send("111", formatted?.text ?? "", { sendId: "42", formatting: formatted?.spans })
      expect(sent(Opcode.MSG_SEND)).toMatchObject([
        {
          message: {
            text: "b u l",
            elements: [
              { type: "STRONG", from: 0, length: 1 },
              { type: "UNDERLINE", from: 2, length: 1 },
              { type: "LINK", from: 4, length: 1, attributes: { url: "https://example.test" } },
            ],
          },
        },
      ])
    } finally {
      await client.close()
    }
  })
  it("refuses private Markdown types without connecting or uploading", async () => {
    const { adapter, client, sent } = connected()
    try {
      await expect(adapter.formatMarkdown?.("^^highlight^^")).rejects.toThrow("personal MAX")
      expect(sent(Opcode.LOGIN)).toEqual([])
      expect(sent(Opcode.MSG_SEND)).toEqual([])
    } finally {
      await client.close()
    }
  })

  it("sends with the send id as MAX's cid, quietly when asked, with the marks in MAX's names", async () => {
    const { adapter, sent } = connected()
    const sendId = adapter.newSendId?.() ?? ""

    const done = await adapter.send("111", "hi there", {
      sendId,
      silent: true,
      markup: [{ type: "bold", from: 0, length: 2 }],
    })

    expect(Number(sendId)).toBeGreaterThan(1_700_000_000_000)
    expect(done).toMatchObject({ sendId, message: { id: "116762160362694590", chatId: "111" } })
    expect(sent(Opcode.MSG_SEND)).toMatchObject([
      {
        chatId: 111,
        notify: false,
        message: { cid: Number(sendId), text: "hi there", elements: [{ type: "STRONG", from: 0, length: 2 }] },
      },
    ])
  })

  it("refuses a send id that would not survive as MAX's cid, before anything is sent", async () => {
    const { adapter, sent } = connected()

    await expect(adapter.send("111", "hi", { sendId: "-4749308424623627866" })).rejects.toMatchObject({
      code: "validation_error",
    })
    expect(sent(Opcode.MSG_SEND)).toEqual([])
  })

  it("refuses a send without a link preview, which MAX's own client cannot make", async () => {
    const { adapter, sent } = connected()

    await expect(
      adapter.send("111", "https://example.test", { sendId: "1790000000000", noPreview: true }),
    ).rejects.toMatchObject({
      code: "validation_error",
    })
    expect(sent(Opcode.MSG_SEND)).toEqual([])
  })

  it("answers history as the client does, MAX's own attachment ids kept as the provider's", async () => {
    const { adapter, client } = connected()

    const page = await adapter.history("Friends", { limit: 5 })
    const direct = await client.messages.list("111", { limit: 5 })

    expect(page.items).toEqual(direct.items.map(toMessage))
    expect(page.items[0]?.attachments).toMatchObject([
      { kind: "photo" },
      { kind: "file", name: "notes.pdf", providerRef: { fileId: "77" } },
    ])
    expect(page.items[0]?.attachments[0]).not.toHaveProperty("providerRef")
  })

  it("resolves a title to its chat, and an id as it is, without connecting", async () => {
    const { adapter, sent } = connected()

    expect(await adapter.resolve("999")).toMatchObject({ id: "999", title: null, kind: "unknown" })
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(await adapter.resolve("Friends")).toMatchObject({ id: "111", title: "Friends", kind: "group" })
  })

  it("deletes, reacts and takes the reaction off, pins and unpins, and marks read", async () => {
    const { adapter, sent } = connected()

    await adapter.delete("111", [MESSAGE], { forEveryone: false })
    await adapter.react("111", MESSAGE, "👍")
    await adapter.react("111", MESSAGE, null)
    await adapter.pin("111", MESSAGE, { notify: false })
    await adapter.unpin("111", MESSAGE)
    await adapter.markRead("111", MESSAGE)

    expect(sent(Opcode.MSG_DELETE)).toMatchObject([{ chatId: 111, forMe: true }])
    expect(sent(Opcode.MSG_REACTION)).toMatchObject([{ reaction: { reactionType: "EMOJI", id: "👍" } }])
    expect(sent(Opcode.MSG_CANCEL_REACTION)).toHaveLength(1)
    expect(sent(Opcode.CHAT_UPDATE)).toHaveLength(2)
    expect(sent(Opcode.CHAT_MARK)).toHaveLength(1)
  })

  it("knows its account from the session, and the account's name from the login", async () => {
    const { adapter, store } = connected()
    expect(adapter.self()).toBeNull()

    store.writeState({ ...store.readState(), viewerId: String(OWNER) })
    expect(adapter.self()).toBe(String(OWNER))
    expect(await adapter.me()).toEqual({
      id: String(OWNER),
      name: "Owner",
      username: null,
      phone: null,
      description: null,
    })
  })
})
