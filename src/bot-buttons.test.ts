import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { SendJournal } from "@wirecat/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { type MockMaxOptions, mockMax } from "./testing/mock-max.js"

const OWNER = 10000001
const BOT = 234377933
const MESSAGE = "116762160362694583"
const DIALOG = OWNER ^ BOT
const NEW_BOT = 220000001
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

const messenger = (extra: MockMaxOptions["answers"] = {}, refuse: MockMaxOptions["refuse"] = {}) => {
  const max = mockMax({
    refuse,
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: OWNER } },
        chats: [
          {
            id: DIALOG,
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
      [Opcode.LINK_INFO]: (payload: Record<string, unknown>) =>
        String(payload.link).endsWith("/somebot")
          ? { user: { contact: { id: NEW_BOT, options: ["ONEME", "BOT"] }, presence: { seen: 1789776000 } } }
          : { user: { contact: { id: 10000002, options: ["ONEME"] } } },
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      ...extra,
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
    const shown = await runWith(["b-show", "messages", "show", String(DIALOG), MESSAGE], environment)

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
    const pressed = await runWith(["b-press", "messages", "press", String(DIALOG), MESSAGE, "No"], environment)

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
    const refused = await runWith(["b-phone", "messages", "press", String(DIALOG), MESSAGE, "4"], environment)

    expect(refused.code).not.toBe(0)
    expect(refused.stderr).toContain("phone number")
    expect(sentWith(Opcode.MSG_CALLBACK)).toEqual([])
  })

  it("starts a bot with the web client's service message, guarded as a send", async () => {
    const { environment, sentWith } = messenger()
    const started = await runWith(["b-start", "chats", "start", String(DIALOG), "--payload", "ref1"], environment)

    expect(started.code).toBe(0)
    expect(sentWith(Opcode.MSG_SEND).map(({ payload }) => payload)).toEqual([
      {
        chatId: DIALOG,
        message: {
          cid: expect.any(Number),
          attaches: [{ _type: "CONTROL", event: "botStarted", startPayload: "ref1" }],
        },
      },
    ])
  })

  it("reports a lost bot-start answer as unknown without repeating the write", async () => {
    const { environment, sentWith } = messenger({ [Opcode.MSG_SEND]: () => undefined })
    const lost = await runWith(["b-start-lost", "chats", "start", "111"], environment)

    expect(lost.code).toBe(14)
    const { error } = JSON.parse(lost.stderr)
    expect(error).toMatchObject({ code: "outcome_unknown", retryable: false })
    expect(sentWith(Opcode.MSG_SEND)).toHaveLength(1)
    expect(new SendJournal(sendsPathFor("b-start-lost")).entries()).toMatchObject([
      { kind: "message", outcome: "outcome_unknown", sendId: expect.any(String) },
    ])
  })

  it("reports a lost callback answer as unknown and never automatically presses twice", async () => {
    const { environment, sentWith } = messenger({ [Opcode.MSG_CALLBACK]: () => undefined })
    const lost = await runWith(["b-press-lost", "messages", "press", "111", MESSAGE, "Yes"], environment)

    expect(lost.code).toBe(14)
    expect(JSON.parse(lost.stderr).error).toMatchObject({ code: "outcome_unknown", retryable: false })
    expect(sentWith(Opcode.MSG_CALLBACK)).toHaveLength(1)
    expect(new SendJournal(sendsPathFor("b-press-lost")).entries()).toMatchObject([
      { kind: "reaction", outcome: "outcome_unknown", messageId: MESSAGE },
    ])
  })

  it("keeps a failed keyboard read as timeout when no button press was attempted", async () => {
    const { environment, sentWith } = messenger({ [Opcode.CHAT_HISTORY]: () => undefined })
    const failed = await runWith(["b-read-lost", "messages", "press", "111", MESSAGE, "Yes"], environment)

    expect(JSON.parse(failed.stderr).error.code).toBe("timeout")
    expect(sentWith(Opcode.MSG_CALLBACK)).toEqual([])
  })

  it("keeps an explicit callback rejection as a known failure", async () => {
    const { environment, sentWith } = messenger({}, { [Opcode.MSG_CALLBACK]: "proto.payload" })
    const failed = await runWith(["b-press-rejected", "messages", "press", "111", MESSAGE, "Yes"], environment)

    expect(failed.code).not.toBe(0)
    expect(JSON.parse(failed.stderr).error.code).not.toBe("outcome_unknown")
    expect(sentWith(Opcode.MSG_CALLBACK)).toHaveLength(1)
    expect(new SendJournal(sendsPathFor("b-press-rejected")).entries()).toMatchObject([
      { kind: "reaction", outcome: "failed" },
    ])
  })

  it("prints the mini app's address and leaves it in no trace, run log, journal or store", async () => {
    const { environment, sentWith } = messenger()
    const opened = await runWith(["b-app", "--trace", "chats", "app", String(DIALOG), "--start", "p"], environment)

    expect(opened.code).toBe(0)
    expect(JSON.parse(opened.stdout)).toMatchObject({ chatId: String(DIALOG), url: APP_URL })
    expect(sentWith(Opcode.BOT_WEB_APP).map(({ payload }) => payload)).toEqual([
      { botId: BOT, chatId: DIALOG, startParam: "p" },
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

  it("starts a bot never written to from its link, in the chat whose id is the two ids XORed", async () => {
    const { environment, sentWith } = messenger()
    const started = await runWith(["b-link", "chats", "start", "https://max.ru/somebot?start=ref9"], environment)

    expect(started.code).toBe(0)
    expect(sentWith(Opcode.LINK_INFO).map(({ payload }) => payload)).toEqual([{ link: "https://max.ru/somebot" }])
    expect(sentWith(Opcode.MSG_SEND).map(({ payload }) => payload)).toEqual([
      {
        chatId: OWNER ^ NEW_BOT,
        message: {
          cid: expect.any(Number),
          attaches: [{ _type: "CONTROL", event: "botStarted", startPayload: "ref9" }],
        },
      },
    ])
  })

  it("refuses a person's link: only a bot is started", async () => {
    const { environment, sentWith } = messenger()
    const refused = await runWith(["b-person", "chats", "start", "max.ru/someone"], environment)

    expect(refused.code).not.toBe(0)
    expect(refused.stderr).toContain("is not a bot's link")
    expect(sentWith(Opcode.MSG_SEND)).toEqual([])
  })
})
