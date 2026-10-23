import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { seedSearchRecipes } from "@wirecat/cli-core/testing"
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
  await db.chats.saveChats(mail, [
    {
      id: "t1",
      title: "Synthetic invoice thread",
      kind: "dialog",
      unreadCount: null,
      lastMessageAt: null,
      participantsCount: null,
    },
  ])
  await db.messages.saveMessages(
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
  await db.searchIndex.fillSearchIndex()
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
  it("search all answers messages and notes, never mail, and --only narrows it", async () => {
    const all = await invoke([
      "search",
      "all",
      "invoice",
      "--limit",
      "20",
      "--page",
      "1",
      "--source",
      "all",
      "--exact",
      "--timezone",
      "UTC",
    ])
    expect(all.code).toBe(0)
    expect(new Set(all.answer.items.map(({ kind }: { kind: string }) => kind))).toEqual(new Set(["message", "note"]))
    const notes = await invoke(["search", "all", "invoice", "--only", "notes"])
    expect(notes.answer.items.map(({ kind }: { kind: string }) => kind)).toEqual(["note"])
    const mail = await invoke(["search", "all", "invoice", "--only", "mail"])
    expect(mail.code).toBe(2)
    expect(mail.stderr).toContain("memo search mail")
  })

  it("search mail points to memo, and search messages never returns mail", async () => {
    const mail = await invoke(["search", "mail", "invoice"])
    expect(mail.code).toBe(2)
    expect(mail.stderr).toContain("the separate memo CLI: install @wirecat/cli-memo, then `memo search mail …`")
    const messages = await invoke([
      "search",
      "messages",
      "invoice NOT has:attachment",
      "--source",
      "all",
      "--page",
      "1",
    ])
    expect(messages.code).toBe(0)
    expect(messages.answer.items.some(({ ref }: { ref: string }) => ref.startsWith("msg:email/"))).toBe(false)
  })

  it("search notes narrows by source: in the query and filter, rejects an unknown source, and pages with --page", async () => {
    const internal = await invoke([
      "search",
      "notes",
      "invoice source:internal",
      "--filter",
      "paid",
      "--limit",
      "5",
      "--page",
      "1",
      "--exact",
      "--timezone",
      "UTC",
    ])
    expect(internal.code).toBe(0)
    expect(internal.answer.items).toHaveLength(1)
    const elsewhere = await invoke(["search", "notes", "invoice", "--source", "notes:fld_none", "--filter", "tag:work"])
    expect(elsewhere.code).toBe(2)
  })
})
