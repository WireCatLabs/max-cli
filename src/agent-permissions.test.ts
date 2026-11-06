import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const agentRun = async (argv: string[], overrides: string[]) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [], contacts: [] },
    },
  })
  const keyring = memoryKeyring()
  const failures: unknown[] = []
  const environment: Environment = {
    store: (profile) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      store.writeState({ ...store.readState(), viewerId: "10000001" })
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const code = await run([...argv, "--json"], {
    ...environment,
    streams: captureStreams(),
    tty: false,
    agent: { overrides, result: () => {}, failure: (error) => failures.push(error) },
  })
  return { code, failures, sent: max.sent }
}

describe("an agent run under mcp serve --permission", () => {
  it.each([
    [["contacts=deny"], ["a-agent", "contacts", "sync"]],
    [["contacts.sync=deny"], ["a-agent", "contacts", "sync"]],
    [["messages=deny"], ["a-agent", "messages", "transcribe", "111", "1"]],
  ])("%j refuses %j before MAX is asked", async (overrides, argv) => {
    const { code, failures, sent } = await agentRun(argv, overrides)
    expect(code).toBe(5)
    expect(failures).toContainEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: "permission_error" }) }),
    )
    expect(sent).toEqual([])
  })
})
