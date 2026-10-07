import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const runAgainst = async (argv: string[]) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [{ id: 0, type: "DIALOG" }] },
      [Opcode.MSG_SEND]: { message: { id: 116762160362694590n, time: 1789776000000, sender: 10000001, text: "yes" } },
      [Opcode.MSG_CANCEL_REACTION]: { reactionInfo: {} },
      [Opcode.MSG_REACTION]: {
        reactionInfo: { counters: [{ count: 1, reaction: "👍" }], yourReaction: "👍", totalCount: 1 },
      },
    },
  })
  const keyring = memoryKeyring()
  const streams = captureStreams()
  const code = await run([...argv, "--json"], {
    streams,
    tty: false,
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  })
  expect(max.unexpected).toEqual([])
  return { code, max, stdout: streams.stdout.join("") }
}

describe("answering and reacting", () => {
  it("`messages send --reply-to` sends the reply link MAX measured, and nothing else changes", async () => {
    const { code, max } = await runAgainst(["messages", "send", "0", "yes", "--reply-to", "116762160362694583"])

    expect(code).toBe(0)
    const sent = max.sent.find((call) => call.opcode === Opcode.MSG_SEND)
    const { message } = (sent?.payload ?? {}) as {
      message: { link: { type: string; messageId: unknown }; elements: unknown[] }
    }
    expect(message.link.type).toBe("REPLY")
    expect(String(message.link.messageId)).toBe("116762160362694583")
    expect(message.elements).toEqual([])
  })

  it("`messages send --comment-to` refuses on MAX, which has no channel comments here, and sends nothing", async () => {
    const { code, max } = await runAgainst(["messages", "send", "0", "yes", "--comment-to", "42"])

    expect(code).toBe(2)
    expect(max.sent.some((call) => call.opcode === Opcode.MSG_SEND)).toBe(false)
  })

  it("`messages send --send-id` sends the id it was given, so MAX can collapse a repeat", async () => {
    const { code, max } = await runAgainst(["messages", "send", "0", "yes", "--send-id", "4242"])

    expect(code).toBe(0)
    expect(max.sent.filter((call) => call.opcode === Opcode.MSG_SEND).map((call) => call.payload.message)).toEqual([
      expect.objectContaining({ cid: 4242, text: "yes" }),
    ])
  })

  it("`--md`: the marks go out as markup", async () => {
    const { code, max } = await runAgainst(["messages", "send", "0", "**yes**", "--md"])

    expect(code).toBe(0)
    expect(max.sent.find((call) => call.opcode === Opcode.MSG_SEND)?.payload).toMatchObject({
      message: { text: "yes", elements: [{ type: "STRONG", from: 0, length: 3 }] },
    })
  })

  it("`reactions remove` takes the reaction off and answers that it is off", async () => {
    const { code, max, stdout } = await runAgainst(["reactions", "remove", "0", "116762160362694583"])

    expect(code).toBe(0)
    expect(String(max.sent.find((call) => call.opcode === Opcode.MSG_CANCEL_REACTION)?.payload.messageId)).toBe(
      "116762160362694583",
    )
    expect(JSON.parse(stdout)).toEqual({
      operationId: expect.any(String),
      chatId: "0",
      messageId: "116762160362694583",
      reaction: null,
    })
  })

  it("`reactions add` sends one emoji reaction and answers with it", async () => {
    const { code, max, stdout } = await runAgainst(["reactions", "add", "0", "116762160362694583", "👍"])

    expect(code).toBe(0)
    expect(max.sent.find((call) => call.opcode === Opcode.MSG_REACTION)?.payload).toMatchObject({
      reaction: { reactionType: "EMOJI", id: "👍" },
    })
    expect(JSON.parse(stdout)).toEqual({
      operationId: expect.any(String),
      chatId: "0",
      messageId: "116762160362694583",
      reaction: "👍",
    })
  })
})
