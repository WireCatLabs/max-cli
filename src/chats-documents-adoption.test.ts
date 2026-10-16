import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

it("reads imported document titles from stored chat links offline without contacting MAX", async () => {
  const profile = "synthetic-documents"
  const account = { provider: "max", account: "500" }
  rememberAccount(MAX_APP, profile, account.account, process.env)
  const store = await openStore()
  try {
    await store.saveChats(account, [
      {
        id: "7",
        title: "Synthetic planning",
        kind: "group",
        unreadCount: 0,
        lastMessageAt: null,
        participantsCount: null,
      },
    ])
    await store.saveMessages(
      account,
      "7",
      [
        {
          id: "1",
          chatId: "7",
          senderId: "10",
          senderName: "Synthetic reader",
          timestamp: "2026-01-01T00:00:00Z",
          editedAt: null,
          text: "https://docs.google.com/document/d/synthetic-document-plan/edit",
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "history" },
    )
    const folder = await store.notes.addFolder({ name: "google-drive:synthetic-owner" })
    const { note } = await store.notes.saveFileNote({
      folderId: folder.id,
      path: "synthetic-document-plan.md",
      title: "Synthetic budget",
      text: "Budget evidence",
      frontMatter: { fileId: "synthetic-document-plan", source: "google-drive" },
    })
    await store.notes.linkMessages({ documents: [{ reference: note.ref, fileId: "synthetic-document-plan" }] })
  } finally {
    await store.close()
  }
  const streams = captureStreams()
  const code = await run([profile, "--offline", "chats", "documents", "list", "7", "--json"], {
    streams,
    tty: false,
    store: (profile) => new SessionStore({ profile, keyring: memoryKeyring() }),
    connection: () => {
      throw new Error("offline documents must not connect")
    },
  })
  expect(code).toBe(0)
  expect(streams.stderr.join("")).toBe("")
  expect(JSON.parse(streams.stdout.join(""))).toMatchObject({
    items: [{ document_id: "synthetic-document-plan", title: "Synthetic budget", in_store: true }],
    meta: { complete: true },
  })
})
