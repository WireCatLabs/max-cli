import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import { expect, it } from "vitest"
import { MaxClient } from "../client.js"
import type { MessageHit } from "../domain/models.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { Connection } from "../protocol/connection.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { serverReplies } from "./replies.js"

it("the native MAX server opens a task for a matching rule without sending, while the audience allows nobody", async () => {
  const root = mkdtempSync(join(tmpdir(), "max-reply-task-"))
  const env = {
    ...process.env,
    MAX_CONFIG_DIR: join(root, "config"),
    MAX_STATE_DIR: join(root, "state"),
    MESSAGING_STORE: join(root, "messages.db"),
  }
  mkdirSync(env.MAX_CONFIG_DIR, { recursive: true })
  writeFileSync(
    join(env.MAX_CONFIG_DIR, "default.replies.json"),
    JSON.stringify({
      audience: { reply: "listed" },
      rules: [
        {
          id: "requests",
          on: true,
          do: ["task"],
          where: { kinds: [], chats: ["111"], notChats: [] },
          when: {
            hours: null,
            words: [],
            question: true,
            mentionsMe: false,
            from: { people: [], notPeople: [], contactsOnly: false },
          },
          reply: { template: "", asReply: true },
          limits: { perChat: "5/1d", perPerson: "5/1d" },
        },
      ],
    }),
  )
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001, names: [{ name: "Test Owner", type: "FULL_NAME" }] } },
        chats: [{ id: 111, title: "Test Group", type: "CHAT", lastEventTime: Date.now() }],
      },
    },
  })
  const session = new SessionStore({ profile: "default", keyring: memoryKeyring() })
  session.writeToken("synthetic-token")
  const client = new MaxClient({
    sends: "caller",
    store: session,
    connection: new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  })
  const rules = serverReplies({
    profile: "default",
    env,
    since: Date.now() - 60_000,
    owner: () => "10000001",
    client: () => client,
    guard: () => {
      throw new Error("task-only rules must never ask for a send")
    },
    note: () => {},
  })
  try {
    await client.connect()
    const hit: MessageHit = {
      id: "1",
      chatId: "111",
      chatTitle: "Test Group",
      senderId: "10000002",
      senderName: "Test Sender",
      timestamp: new Date().toISOString(),
      editedAt: null,
      text: "Synthetic request?",
      outgoing: false,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
    rules.arrived(hit)
    await rules.settled()
    const store = await openStore({ env })
    try {
      const tasks = await store.tasks.list({ state: "open" })
      expect(tasks).toHaveLength(1)
      expect(tasks[0]?.kind).toBe("request")
      expect(rules.summary().tasks).toEqual({ requests: 1 })
    } finally {
      await store.close()
    }
    expect(max.sent.some(({ opcode }) => opcode === Opcode.MSG_SEND)).toBe(false)
  } finally {
    await rules.close()
    await client.close()
  }
})
