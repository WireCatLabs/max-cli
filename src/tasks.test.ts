import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring, resolvePaths, writeSecurely } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP as app } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const account = { provider: "max", account: "601" }
const profile = "tasks-local"
const PROMISE = "msg:max/601/7/101"
const cli = async (words: string[], picked = profile) => {
  const streams = captureStreams()
  const code = await run([picked, ...words], {
    streams,
    tty: false,
    store: () => {
      const s = new SessionStore({ profile: picked, keyring: memoryKeyring() })
      s.writeState({ ...s.readState(), viewerId: "601" })
      return s
    },
    connection: () => {
      throw new Error("tasks never connect")
    },
  })
  return { code, out: streams.stdout.join("\n"), err: streams.stderr.join("\n") }
}

beforeAll(async () => {
  rememberAccount(app, profile, account.account, process.env)
  rememberAccount(app, "tasks-readonly", account.account, process.env)
  const store = await openStore()
  try {
    const chat = { id: "7", title: "Synthetic Group", kind: "group" as const }
    await store.saveChats(account, [{ ...chat, unreadCount: 0, lastMessageAt: null, participantsCount: null }])
    await store.saveMessages(
      account,
      "7",
      [
        {
          id: "101",
          chatId: "7",
          senderId: "11",
          senderName: "Ana",
          text: "I'll send the invoice tomorrow",
          timestamp: "2026-10-06T10:00:00Z",
          editedAt: null,
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "fixture" },
    )
  } finally {
    await store.close()
  }
  const paths = resolvePaths({ appName: app.appName, prefix: app.envPrefix })
  mkdirSync(paths.config, { recursive: true, mode: 0o700 })
  writeSecurely(
    join(paths.config, "config.json"),
    JSON.stringify({ profiles: { "tasks-readonly": { permissions: { tasks: "readonly" } } } }),
    0o600,
  )
})

describe("tasks through max", () => {
  it("adds, lists, counts and closes a task in the local store without connecting", async () => {
    const added = await cli(["tasks", "add", PROMISE, "--type", "promise", "--category", "other", "--json"])
    expect(added.code, added.err).toBe(0)
    const { id } = JSON.parse(added.out).item

    const listed = await cli(["tasks", "list", "state:open", "kind:promise", "--limit", "5", "--json"])
    expect(listed.code, listed.err).toBe(0)
    expect(JSON.parse(listed.out).items).toMatchObject([{ id, kind: "promise", state: "open" }])

    const counted = await cli(["stats", "tasks", "show", "--chat", "7", "--type", "promise", "--json"])
    expect(JSON.parse(counted.out).item).toMatchObject({ open: 1, rows: [{ chat: "chat:max/601/7", open: 1 }] })

    const closed = await cli(["tasks", "close", id, "--as", "dismissed", "--reason", "no-reply-needed", "--json"])
    expect(closed.code, closed.err).toBe(0)
    expect(JSON.parse(closed.out).item).toMatchObject({ state: "dismissed", reason: "no-reply-needed" })
  })

  it("claims, tags and releases a task, and lists the categories", async () => {
    const added = await cli(["tasks", "add", PROMISE, "--type", "request", "--category", "money", "--new", "--json"])
    expect(added.code, added.err).toBe(0)
    const { id } = JSON.parse(added.out).item

    const claimed = await cli(["tasks", "claim", id, "--holder", "agent-a", "--lease", "10m", "--json"])
    expect(claimed.code, claimed.err).toBe(0)
    expect(JSON.parse(claimed.out).item).toMatchObject({ claimed_by: "agent-a" })
    expect((await cli(["tasks", "claim", id, "--holder", "agent-b", "--json"])).code).not.toBe(0)

    expect((await cli(["tags", "add", "invoice", "--task", id, "--json"])).code).toBe(0)
    expect((await cli(["tags", "remove", "invoice", "--task", id, "--json"])).code).toBe(0)

    const released = await cli(["tasks", "release", id, "--holder", "agent-a", "--json"])
    expect(released.code, released.err).toBe(0)
    expect(JSON.parse(released.out).item).toMatchObject({ claimed_by: null })

    const categories = await cli(["tasks", "categories", "--json"])
    expect(categories.code, categories.err).toBe(0)
    expect(categories.out).toContain("money")
  })

  it("keeps an unsure agent's close open as a suggestion the owner refuses, and closes on --as-owner", async () => {
    const added = await cli(["tasks", "add", PROMISE, "--type", "request", "--category", "bills", "--new", "--json"])
    expect(added.code, added.err).toBe(0)
    const { id } = JSON.parse(added.out).item

    process.env.AI_AGENT = "test-agent"
    try {
      const blind = await cli(["tasks", "close", id, "--as", "done", "--json"])
      expect(blind.code).toBe(2)
      expect(blind.err).toContain("task.certainty-required")

      const unsure = await cli(["tasks", "close", id, "--as", "done", "--certainty", "0.5", "--json"])
      expect(unsure.code, unsure.err).toBe(0)
      expect(JSON.parse(unsure.out).item).toMatchObject({ state: "open" })

      const suggested = await cli(["tasks", "list", "close:suggested", "--json"])
      expect(JSON.parse(suggested.out).items).toMatchObject([{ id }])

      const refused = await cli(["tasks", "reject", id, "--as-owner", "--json"])
      expect(refused.code, refused.err).toBe(0)
      expect(JSON.parse((await cli(["tasks", "list", "close:suggested", "--json"])).out).items).toEqual([])

      const owner = await cli(["tasks", "close", id, "--as", "done", "--as-owner", "--json"])
      expect(owner.code, owner.err).toBe(0)
      expect(JSON.parse(owner.out).item).toMatchObject({ state: "done" })
    } finally {
      delete process.env.AI_AGENT
    }
  })

  it("refuses task writes on a profile where tasks are read-only", async () => {
    expect(
      (await cli(["tasks", "add", PROMISE, "--type", "promise", "--category", "other", "--json"], "tasks-readonly"))
        .code,
    ).toBe(5)
  })
})
