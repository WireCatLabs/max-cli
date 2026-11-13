import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { syncAfterInstallCases } from "@wirecat/cli-core/testing"
import { describe, it } from "vitest"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const ME = 10000001
const TIME = Date.UTC(2026, 8, 1)

const signedIn = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: () => ({
        profile: { contact: { id: ME } },
        chats: [{ id: 111, title: "Друзья", type: "CHAT", lastEventTime: TIME }],
      }),
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: (BigInt(TIME) << 16n) + 1n, time: TIME, sender: 10000002, text: "hi", attaches: [] }],
      },
      [Opcode.CONTACT_INFO]: { contacts: [] },
    },
  })
  const keyring = memoryKeyring()
  return {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      if (!store.readState().viewerId) store.writeState({ ...store.readState(), viewerId: String(ME) })
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
}

describe("sync runs right after install, whatever the shared WireCat config holds", () => {
  for (const one of syncAfterInstallCases({
    sync: ["s-fetch", "messages", "sync", "111", "--pause", "1ms", "--limit", "10"],
    run: async (argv, env) => {
      const streams = captureStreams()
      const store = join(mkdtempSync(join(tmpdir(), "max-install-")), "messages.db")
      const code = await run(argv, {
        ...signedIn(),
        streams,
        tty: false,
        env: { ...process.env, MESSAGING_STORE: store, ...env },
      })
      return { code, err: streams.stderr.join("\n") }
    },
  }))
    it(one.name, () => one.run())
})
