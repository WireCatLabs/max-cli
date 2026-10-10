import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const LAST_EVENT = 1789776000000

const messenger = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: LAST_EVENT }],
      },
      [Opcode.CHAT_DELETE]: {},
      [Opcode.CHAT_CLEAR]: {},
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const sent = (opcode: number) =>
    max.sent
      .filter((one) => one.opcode === opcode)
      .map((one) => ({ ...one.payload, chatId: String(one.payload.chatId) }))
  return { environment, sent }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, stderr: streams.stderr.join("") }
}

describe("deleting a chat and clearing it, for this account only", () => {
  it("asks first, and with --allow-dangerous sends forAll: false and the chat's last event time", async () => {
    const { environment, sent } = messenger()
    const unasked = await runWith(["chats", "delete", "111"], environment)
    const deleted = await runWith(["chats", "delete", "111", "--allow-dangerous"], environment)
    const cleared = await runWith(["chats", "clear", "111", "--allow-dangerous"], environment)

    expect(unasked.code).toBe(7)
    expect(unasked.stderr).toContain("--allow-dangerous")
    expect([deleted.code, cleared.code]).toEqual([0, 0])
    expect(sent(Opcode.CHAT_DELETE)).toEqual([{ chatId: "111", lastEventTime: LAST_EVENT, forAll: false }])
    expect(sent(Opcode.CHAT_CLEAR)).toEqual([{ chatId: "111", lastEventTime: LAST_EVENT, forAll: false }])
  })
})
