import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { SendJournal } from "@leemour/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const OWNER = 10000001
const BOT = 234377933
const MESSAGE = "116762160362694583"
const APP_URL = "https://app.example/#tgWebAppData=SIGNED-SECRET"

const keyboard = {
  _type: "INLINE_KEYBOARD",
  callbackId: "cb-1",
  keyboard: {
    buttons: [
      [
        { type: "CALLBACK", text: "Yes", payload: "answer:yes", intent: "DEFAULT" },
        { type: "CALLBACK", text: "No", payload: "answer:no", intent: "DEFAULT" },
      ],
      [
        { type: "LINK", text: "Site", url: "https://example.org", intent: "DEFAULT" },
        { type: "REQUEST_CONTACT", text: "Phone", intent: "DEFAULT" },
      ],
    ],
  },
}

const messenger = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: OWNER } },
        chats: [
          {
            id: 111,
            title: "Bot",
            type: "DIALOG",
            lastEventTime: 1789776000000,
            participants: { [OWNER]: 0, [BOT]: 0 },
          },
        ],
      },
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: BigInt(MESSAGE), time: 1789776000000, sender: BOT, text: "Pick", attaches: [keyboard] }],
      },
      [Opcode.MSG_CALLBACK]: {},
      [Opcode.MSG_SEND]: { message: { id: 116762160362694599n, time: 1789776100000, sender: OWNER, attaches: [] } },
      [Opcode.BOT_WEB_APP]: { url: APP_URL },
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
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
  const sentWith = (opcode: number) => max.sent.filter((request) => request.opcode === opcode)
  return { environment, sentWith }
}

const runWith = async (argv: string[], environment: Environment) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("a bot's buttons on the personal account", () => {
  it("shows the keyboard in `messages show`, with the link of a link button only", async () => {
    const { environment } = messenger()
    const shown = await runWith(["b-show", "messages", "show", "111", MESSAGE], environment)

    expect(shown.code).toBe(0)
    const [attachment] = JSON.parse(shown.stdout).attachments
    expect(attachment.buttons).toEqual([
      [
        { kind: "callback", text: "Yes" },
        { kind: "callback", text: "No" },
      ],
      [
        { kind: "link", text: "Site", url: "https://example.org" },
        { kind: "contact", text: "Phone" },
      ],
    ])
    expect(shown.stdout).not.toContain("answer:yes")
  })

  it("presses a callback button with the attach's handle and the button's payload, and journals it", async () => {
    const { environment, sentWith } = messenger()
    const pressed = await runWith(["b-press", "messages", "press", "111", MESSAGE, "No"], environment)

    expect(pressed.code).toBe(0)
    expect(
      sentWith(Opcode.MSG_CALLBACK).map(({ payload }) => ({ ...payload, timestamp: typeof payload.timestamp })),
    ).toEqual([{ callbackId: "cb-1", type: "CALLBACK", payload: "answer:no", timestamp: "number" }])
    expect(JSON.parse(pressed.stdout)).toMatchObject({ button: { kind: "callback", text: "No" } })
    const journal = new SendJournal(sendsPathFor("b-press")).entries().filter((entry) => entry.outcome === "sent")
    expect(journal.map((entry) => entry.kind)).toContain("reaction")
  })

  it("never presses a button that would hand the owner's phone to the bot", async () => {
    const { environment, sentWith } = messenger()
    const refused = await runWith(["b-phone", "messages", "press", "111", MESSAGE, "4"], environment)

    expect(refused.code).not.toBe(0)
    expect(refused.stderr).toContain("phone number")
    expect(sentWith(Opcode.MSG_CALLBACK)).toEqual([])
  })

  it("starts a bot with the web client's service message, guarded as a send", async () => {
    const { environment, sentWith } = messenger()
    const started = await runWith(["b-start", "chats", "start", "111", "--payload", "ref1"], environment)

    expect(started.code).toBe(0)
    expect(sentWith(Opcode.MSG_SEND).map(({ payload }) => payload)).toEqual([
      {
        chatId: 111,
        message: {
          cid: expect.any(Number),
          attaches: [{ _type: "CONTROL", event: "botStarted", startPayload: "ref1" }],
        },
      },
    ])
  })

  it("prints the mini app's address and leaves it in no trace, run log, journal or store", async () => {
    const { environment, sentWith } = messenger()
    const opened = await runWith(["b-app", "--trace", "chats", "app", "111", "--start", "p"], environment)

    expect(opened.code).toBe(0)
    expect(JSON.parse(opened.stdout)).toMatchObject({ chatId: "111", url: APP_URL })
    expect(sentWith(Opcode.BOT_WEB_APP).map(({ payload }) => payload)).toEqual([
      { botId: BOT, chatId: 111, startParam: "p" },
    ])
    expect(opened.stderr).not.toContain("SIGNED-SECRET")
    const roots = [process.env.MAX_STATE_DIR, process.env.MAX_CACHE_DIR, process.env.MAX_CONFIG_DIR]
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? files(path) : [path]
      })
    const kept = [
      ...roots.flatMap((root) => (root && existsSync(root) ? files(root) : [])),
      ...[process.env.MESSAGING_STORE ?? ""].filter(existsSync),
    ]
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.filter((path) => readFileSync(path).includes("SIGNED-SECRET"))).toEqual([])
  })
})
