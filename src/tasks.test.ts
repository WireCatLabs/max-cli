import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { captureStreams, memoryKeyring, resolvePaths, writeSecurely } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
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
    const added = await cli(["tasks", "add", PROMISE, "--type", "promise", "--json"])
    expect(added.code, added.err).toBe(0)
    const { id } = JSON.parse(added.out)

    const listed = await cli([
      "tasks",
      "list",
      "--state",
      "open",
      "--chat",
      "7",
      "--type",
      "promise",
      "--before-time",
      "2099-01-01T00:00:00Z",
      "--limit",
      "5",
      "--json",
    ])
    expect(listed.code, listed.err).toBe(0)
    expect(JSON.parse(listed.out).items).toMatchObject([{ id, message: { text: "I'll send the invoice tomorrow" } }])

    const counted = await cli(["stats", "tasks", "show", "--chat", "7", "--type", "promise", "--json"])
    expect(JSON.parse(counted.out).items).toMatchObject([{ group: "7", open: 1 }])

    const closed = await cli(["tasks", "close", id, "--as", "dismissed", "--reason", "no-reply-needed", "--json"])
    expect(closed.code, closed.err).toBe(0)
    expect(JSON.parse(closed.out)).toMatchObject({ state: "dismissed", reason: "no-reply-needed" })
  })

  it("refuses task writes on a profile where tasks are read-only", async () => {
    expect((await cli(["tasks", "add", PROMISE, "--type", "promise", "--json"], "tasks-readonly")).code).toBe(5)
  })
})
