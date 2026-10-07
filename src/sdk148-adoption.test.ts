import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring, resolvePaths, writeSecurely } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP as app } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const account = { provider: "max", account: "501" }
const profile = "sdk148-local"
const cli = async (words: string[], picked = profile) => {
  const streams = captureStreams()
  const code = await run([picked, ...words], {
    streams,
    tty: false,
    store: () => {
      const s = new SessionStore({ profile: picked, keyring: memoryKeyring() })
      s.writeState({ ...s.readState(), viewerId: "501" })
      return s
    },
    connection: () => {
      throw new Error("local commands must not connect")
    },
  })
  return { code, out: streams.stdout.join("\n"), err: streams.stderr.join("\n") }
}
beforeAll(async () => {
  rememberAccount(app, profile, account.account, process.env)
  rememberAccount(app, "sdk148-readonly", account.account, process.env)
  const store = await openStore()
  try {
    const chat = {
      id: "7",
      title: "Synthetic Group",
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    }
    await store.saveChats(account, [chat])
    await store.saveChats({ ...account, account: "502" }, [chat])
    await store.saveMessages(
      account,
      "7",
      [
        {
          id: "101",
          chatId: "7",
          senderId: "11",
          senderName: null,
          text: "synthetic invoice",
          timestamp: "2026-10-04T10:00:00Z",
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
    JSON.stringify({ profiles: { "sdk148-readonly": { permissions: { tags: "readonly", searches: "readonly" } } } }),
    0o600,
  )
})
describe("SDK148 local commands through the consumer", () => {
  it("keeps exact queries distinct from word-form searches and saves the choice", async () => {
    const forms = await cli(["messages", "search", "invoices", "--json"])
    const exact = await cli(["messages", "search", "invoices", "--exact", "--json"])
    expect(forms.code, forms.err).toBe(0)
    expect(exact.code, exact.err).toBe(0)
    expect(JSON.parse(forms.out).items).toHaveLength(1)
    expect(JSON.parse(exact.out).items).toEqual([])
    const count = await cli(["stats", "messages", "show", "invoices", "--exact", "--json"])
    expect(count.code, count.err).toBe(0)
    const saved = await cli(["searches", "create", "exact-invoices", "invoices", "--exact", "--json"])
    expect(saved.code, saved.err).toBe(0)
    const reused = await cli(["messages", "search", "--saved", "exact-invoices", "--json"])
    expect(reused.code, reused.err).toBe(0)
    expect(JSON.parse(reused.out).items).toEqual([])
    expect((await cli(["searches", "delete", "exact-invoices", "--json"])).code).toBe(0)
  })

  it("tags one account's chat and searches it without a network connection", async () => {
    const added = await cli(["tags", "add", "Work", "--chat", "7", "--json"])
    expect(added.code, added.err).toBe(0)
    expect(JSON.parse(added.out)).toMatchObject({ added: ["work"] })
    const listed = await cli(["tags", "list", "--tag", "work", "--type", "chat", "--json"])
    expect(JSON.parse(listed.out).items).toHaveLength(1)
    const found = await cli(["messages", "search", "tag:work", "--json"])
    expect(found.code, found.err).toBe(0)
    expect(JSON.parse(found.out).items.map((m: { id: string }) => m.id)).toEqual(["101"])
    const store = await openStore()
    try {
      expect(await store.tags({ provider: account.provider, account: "502" }, {})).toEqual([])
    } finally {
      await store.close()
    }
    expect((await cli(["tags", "remove", "work", "--chat", "7", "--json"])).code).toBe(0)
  })
  it("refuses local tag and saved-query writes on a readonly resource", async () => {
    expect((await cli(["tags", "add", "x", "--chat", "7", "--json"], "sdk148-readonly")).code).toBe(5)
    expect((await cli(["searches", "create", "blocked", "invoice", "--json"], "sdk148-readonly")).code).toBe(5)
  })
  it("runs saved query parameters and honors no-record without deleting named searches", async () => {
    expect((await cli(["searches", "create", "invoices", "invoice", "--chat", "7", "--json"])).code).toBe(0)
    expect((await cli(["searches", "clear", "--json"])).code).toBe(0)
    const found = await cli(["messages", "search", "--saved", "invoices", "--no-record", "--json"])
    expect(found.code, found.err).toBe(0)
    expect(JSON.parse(found.out).items).toHaveLength(1)
    expect(JSON.parse((await cli(["searches", "history", "--json"])).out).items).toEqual([])
    expect(JSON.parse((await cli(["searches", "list", "--json"])).out).items).toHaveLength(1)
  })
  it("clears owner-maintenance flood state without opening a connection", async () => {
    const cleared = await cli(["flood", "clear", "--json"])
    expect(cleared.code, cleared.err).toBe(0)
    expect(JSON.parse(cleared.out)).toMatchObject({ cleared: { deadlines: [], sendBlock: null } })
  })
  it("uses store-wide stem settings and refuses them under a profile lock", async () => {
    const set = await cli(["config", "set", "searchStemmers.latin", "english", "--json"])
    expect(set.code, set.err).toBe(0)
    expect(JSON.parse(set.out)).toMatchObject({ scope: "store", value: "english" })
    expect((await cli(["config", "set", "searchStemmers.latin", "english", "--defaults", "--json"])).code).toBe(2)
    const before = process.env.MAX_PROFILE_LOCK
    process.env.MAX_PROFILE_LOCK = profile
    try {
      expect((await cli(["config", "unset", "searchStemmers.latin", "--json"])).code).toBe(5)
    } finally {
      if (before === undefined) delete process.env.MAX_PROFILE_LOCK
      else process.env.MAX_PROFILE_LOCK = before
    }
  })
})
