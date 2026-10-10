import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { seedSearchRecipes } from "@wirecat/cli-messaging/testing"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const refuse = vi.fn(() => {
  throw new Error("synthetic search must not connect")
})
const keyring = memoryKeyring()
const account = { provider: "max", account: "500" }
const mail = { provider: "email", account: "owner@example.test" }
const db = await openStore({ path: process.env.MESSAGING_STORE })
beforeAll(async () => {
  rememberAccount(MAX_APP, "default", account.account, process.env)
  await seedSearchRecipes(db, account)
  await db.saveChats(mail, [
    {
      id: "t1",
      title: "Synthetic invoice thread",
      kind: "dialog",
      unreadCount: null,
      lastMessageAt: null,
      participantsCount: null,
    },
  ])
  await db.saveMessages(
    mail,
    "t1",
    [
      {
        id: "m1",
        chatId: "t1",
        senderId: "billing@example.test",
        senderName: "Billing",
        timestamp: "2026-01-21T10:00:00.000Z",
        editedAt: null,
        text: "invoice attached for January",
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "himalaya" },
  )
  await db.notes.addNote({ title: "Billing notes", text: "the invoice is paid by the 25th" })
  await db.fillSearchIndex()
})
afterAll(async () => {
  await db.close()
  expect(refuse).not.toHaveBeenCalled()
})
const invoke = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json", "--offline", "--no-record"], {
    streams,
    tty: false,
    store: (profile: string) => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: "500" })
      return session
    },
    connection: refuse,
  })
  return { code, answer: JSON.parse(streams.stdout.join("\n") || "null"), stderr: streams.stderr.join("\n") }
}

describe("search <resource> adoption", () => {
  it("search all answers messages, mail and notes, and --only narrows it", async () => {
    const all = await invoke(["search", "all", "invoice", "--limit", "20", "--exact", "--timezone", "UTC"])
    expect(all.code).toBe(0)
    expect(new Set(all.answer.items.map(({ kind }: { kind: string }) => kind))).toEqual(
      new Set(["message", "mail", "note"]),
    )
    const notes = await invoke(["search", "all", "invoice", "--only", "notes"])
    expect(notes.answer.items.map(({ kind }: { kind: string }) => kind)).toEqual(["note"])
  })

  it("search mail reads the mailbox only, and search messages never returns mail", async () => {
    const found = await invoke([
      "search",
      "mail",
      "invoice",
      "--chat",
      "t1",
      "--limit",
      "5",
      "--newest",
      "--exact",
      "--context",
      "0",
      "--timezone",
      "UTC",
    ])
    expect(found.code).toBe(0)
    expect(found.answer.items.map(({ locator }: { locator: string }) => locator)).toEqual([
      "msg:email/owner%40example.test/t1/m1",
    ])
    const messages = await invoke(["search", "messages", "invoice", "--source", "all", "--type", "text"])
    expect(messages.code).toBe(0)
    expect(messages.answer.items.some(({ locator }: { locator: string }) => locator.startsWith("msg:email/"))).toBe(
      false,
    )
  })

  it("search notes narrows by type, folder, tag and filter, and pages with --offset", async () => {
    const internal = await invoke([
      "search",
      "notes",
      "invoice",
      "--type",
      "internal",
      "--filter",
      "paid",
      "--limit",
      "5",
      "--offset",
      "0",
      "--exact",
      "--timezone",
      "UTC",
    ])
    expect(internal.code).toBe(0)
    expect(internal.answer.hits).toHaveLength(1)
    const elsewhere = await invoke(["search", "notes", "invoice", "--folder", "fld_none", "--tag", "work"])
    expect(elsewhere.answer.hits).toHaveLength(0)
  })
})
