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
        chats: [{ id: 111, title: "Bot", type: "DIALOG", lastEventTime: 1789776000000 }],
      },
      [Opcode.CHAT_HISTORY]: {
        messages: [{ id: BigInt(MESSAGE), time: 1789776000000, sender: BOT, text: "Pick", attaches: [keyboard] }],
      },
      [Opcode.MSG_CALLBACK]: {},
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
})
