import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { expect, it } from "vitest"
import { MAX_APP as app } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

it("authors local contact metadata and classifies cached channels without a messenger connection", async () => {
  const root = mkdtempSync(join(tmpdir(), "people-consumer-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "messages.db"),
    MAX_CONFIG_DIR: join(root, "config"),
    MAX_STATE_DIR: join(root, "state"),
  }
  rememberAccount(app, "default", "10000001", env)
  const key = { provider: "max", account: "10000001" }
  const store = await openStore({ path: env.MESSAGING_STORE })
  try {
    await store.savePeople(key, [{ id: "101", name: "Synthetic contact" }])
    await store.saveChats(key, [
      { id: "99", title: "AI news", kind: "channel", unreadCount: 0, lastMessageAt: null, participantsCount: null },
    ])
    await store.saveChatMetadata(key, {
      chatId: "99",
      title: "AI news",
      username: null,
      description: "Synthetic metadata",
    })
  } finally {
    await store.close()
  }
  const keyring = memoryKeyring()
  const session = new SessionStore({ profile: "default", env, keyring })
  session.writeState({ ...session.readState(), viewerId: "10000001" })
  const environment = {
    env,
    store: () => session,
    connection: () => {
      throw new Error("local metadata must not connect")
    },
  }
  const call = async (argv: string[]) => {
    const streams = captureStreams()
    const code = await run(["--offline", ...argv, "--json"], { ...environment, streams, tty: false })
    expect(code, streams.stderr.join("")).toBe(0)
    return JSON.parse(streams.stdout.join(""))
  }
  expect(await call(["contacts", "alias", "set", "101", "Local label"])).toMatchObject({ alias: "Local label" })
  const file = join(root, "own-note.md")
  writeFileSync(file, "Own synthetic note")
  const note = await call(["contacts", "notes", "add", "Local label", "--file", file])
  expect(await call(["contacts", "notes", "list", "101"])).toMatchObject({ items: [{ id: note.id }] })
  expect(await call(["contacts", "notes", "show", "101", note.id])).toMatchObject({ text: "Own synthetic note" })
  expect(await call(["contacts", "notes", "edit", "101", note.id, "--revision", "1", "--file", file])).toMatchObject({
    revision: 2,
  })
  expect(await call(["contacts", "show", "101", "--with-notes"])).toMatchObject({
    alias: "Local label",
    notes: [{ text: "Own synthetic note" }],
  })
  expect(await call(["metadata", "get", "--chat", "99"])).toMatchObject({ metadata: { title: "AI news" } })
  expect(await call(["tags", "auto", "--chat", "99", "--limit", "1", "--dry-run"])).toMatchObject({ dryRun: true })
  await call(["tags", "auto", "--chat", "99", "--limit", "1"])
  expect(await call(["tags", "list", "--source", "auto"])).toMatchObject({ items: [{ tag: "ai" }, { tag: "news" }] })
  await call(["tags", "remove", "news", "--chat", "99", "--source", "auto"])
  await call(["contacts", "notes", "remove", "101", note.id])
  await call(["contacts", "alias", "rm", "101"])
})
