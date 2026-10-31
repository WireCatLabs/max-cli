import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const refuse = vi.fn(() => {
  throw new Error("an offline project read must not connect")
})
const keyring = memoryKeyring()
const profile = "projects-adoption"
const account = { provider: "max", account: "500" }
const db = await openStore()
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  const message = (id: string, text: string, at: string) => ({
    id,
    chatId: "7",
    senderId: "700",
    senderName: "Olga",
    timestamp: at,
    editedAt: null,
    text,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  })
  await db.messages.saveMessages(
    account,
    "7",
    [message("1", "Harbour crane booked", ago(5)), message("2", "Port fees paid", ago(4)), message("3", "ok", ago(3))],
    { via: "test" },
  )
  const project = await db.knowledge.addProject({ name: "Harbour" })
  await db.knowledge.relate(null, {
    from: "chat:max/500/7",
    to: project.ref,
    kind: "member-of",
    confirmed: true,
  })
})
afterAll(async () => {
  await db.close()
  expect(refuse).not.toHaveBeenCalled()
})

const invoke = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, "projects", "evidence", "Harbour", ...argv, "--json", "--offline", "--no-record"], {
    streams,
    tty: false,
    connection: refuse,
    store: () => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: account.account })
      return session
    },
  })
  return { code, body: JSON.parse(streams.stdout.join("") || "{}") }
}

it("reads a project's words, aliases, contacts and linked chat from the store, and resumes from its cursor", async () => {
  const options = [
    "--alias",
    "Port",
    "--context-query",
    "crane",
    "--contact",
    "Olga",
    "--since-time",
    "30d",
    "--before-time",
    new Date(Date.now() + 3_600_000).toISOString(),
    "--limit",
    "100",
    "--max-pages",
    "1",
    "--before-n",
    "1",
    "--after-n",
    "1",
    "--no-catch-up",
  ]
  const first = await invoke(options)
  expect(first.code).toBe(0)
  expect(first.body.item.linked_chats[0]).toMatchObject({ chat: "7", completeness: { state: "unknown" } })
  const cursor = first.body.item.checkpoint
  expect(cursor).toEqual(expect.any(String))
  const rest = await invoke([...options, "--cursor", cursor])
  expect(rest.code).toBe(0)
  expect(rest.body.item).toMatchObject({ resumed: true, totals: { invocations: 2 } })
  expect(first.body.item.items.map((one: { ref: string }) => one.ref)).toContain("msg:max/500/7/1")
})

it("with --sync-first offline tries the chat it does not hold and keeps it partial, still reading the store", async () => {
  const { code, body } = await invoke(["--sync-first", "--sync-time", "30s"])
  expect(code).toBe(0)
  expect(body.item.fetch).toEqual([
    expect.objectContaining({ chat: "chat:max/500/7", state: "failed", reason: "validation_error" }),
  ])
  expect(body.item.items.length).toBe(3)
  expect(body.meta.complete).toBe(false)
})
