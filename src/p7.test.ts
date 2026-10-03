import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { levelFor } from "@leemour/cli-messaging/sends"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { contextFor } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { commandPermission } from "./permissions.js"
import { createProgram, type RunOptions, run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const configPath = () => resolveSettings().configPath
const save = (config: unknown) => {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config))
}
beforeEach(() => save({ profiles: {} }))
const cli = async (args: string[], options: RunOptions = {}) => {
  const streams = captureStreams()
  const code = await run(args, { ...options, streams, tty: false })
  return { code, stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
}
const scripted = () => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [{ id: 111, type: "CHAT", title: "Synthetic" }],
      },
      [Opcode.MSG_SEND]: {
        message: { id: 116762160362694583n, time: 1789776000000, sender: 10000001, text: "synthetic" },
      },
      [Opcode.MSG_DELETE]: {},
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHAT_HISTORY]: { messages: [] },
    },
  })
  const keyring = memoryKeyring()
  const environment: RunOptions = {
    store: (profile) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("synthetic-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 100 }),
  }
  return { max, environment }
}

describe("P7 permissions", () => {
  it("runs the owner's mixed message policy: read and delete, but no send", async () => {
    save({ profiles: { work: { permissions: { messages: "readonly", "messages.delete": "allow" } } } })
    const { max, environment } = scripted()
    expect((await cli(["work", "messages", "send", "111", "synthetic", "--json"], environment)).code).toBe(5)
    expect(max.sent).toEqual([])
    expect((await cli(["work", "messages", "list", "111", "--json"], environment)).code).toBe(0)
    const deleted = await cli(["work", "messages", "delete", "111", "116762160362694583", "--json"], environment)
    expect(deleted.code, deleted.stderr).toBe(0)
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.MSG_DELETE)).toHaveLength(1)
    expect(levelFor(resolveSettings({ profile: "work" }).permissions, "contacts.add").level).toBe("allow")
    const shown = await cli(["work", "config", "show", "--json"])
    expect(JSON.parse(shown.stdout).permissionSources["messages.delete"]).toBe("config file: profiles.work")
  })

  it.each([["messages", "list", "111"], ["inbox"], ["review"], ["watch"], ["serve"], ["store", "fetch", "111"]])(
    "refuses message reads through %j before any MAX request",
    async (...args) => {
      save({ profiles: { work: { permissions: { messages: "deny" } } } })
      const { max, environment } = scripted()
      const result = await cli(["work", ...args, "--json"], environment)
      expect(result.code, result.stderr).toBe(5)
      expect(max.sent).toEqual([])
    },
  )

  it.each([false, true])("ask uses an explicit terminal answer %s and does not send on no", async (accepted) => {
    save({ profiles: { work: { permissions: { "messages.send": "ask" } } } })
    const { max, environment } = scripted()
    const answer = vi.fn(() => (accepted ? "yes" : "no"))
    const result = await cli(["work", "messages", "send", "111", "synthetic"], { ...environment, answer })
    expect(result.code, result.stderr).toBe(accepted ? 0 : 130)
    expect(answer).toHaveBeenCalledOnce()
    expect(max.sent.some(({ opcode }) => opcode === Opcode.MSG_SEND)).toBe(accepted)
  })

  it("never asks under JSON, while --yes can authorize a noncritical ask", async () => {
    save({ profiles: { work: { permissions: { "messages.send": "ask" } } } })
    const { max, environment } = scripted()
    const answer = vi.fn(() => "yes")
    expect(
      (await cli(["work", "messages", "send", "111", "synthetic", "--json"], { ...environment, answer })).code,
    ).toBe(7)
    expect(answer).not.toHaveBeenCalled()
    expect(max.sent).toEqual([])
    expect((await cli(["work", "messages", "send", "111", "synthetic", "--json", "--yes"], environment)).code).toBe(0)
  })

  it("gates native client reads as well as command handlers", async () => {
    save({ profiles: { work: { permissions: { messages: "deny" } } } })
    const { max, environment } = scripted()
    const client = contextFor({ profile: "work" }, environment).createClient()
    try {
      expect(() => client.messages.list("111")).toThrow("denies messages")
    } finally {
      await client.close()
    }
    expect(max.sent).toEqual([])
  })

  it("maps every command leaf, including raw Bot API and housekeeping", () => {
    const walk = (node: ReturnType<typeof createProgram>): void => {
      if (!node.commands.length) expect(() => commandPermission(node)).not.toThrow()
      for (const child of node.commands) walk(child)
    }
    walk(createProgram())
  })

  it("migrates legacy settings and group consent, previews without writing, and refuses retired setters", async () => {
    save({ defaults: { allow: ["send", "pin"] }, profiles: { work: { readOnly: true }, home: { serve: false } } })
    const path = join(process.env.MAX_STATE_DIR ?? "", "profiles", "work.moderation.json")
    const { defaultRules } = await import("./moderation/rules.js")
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({
        groups: { "111": { ...defaultRules("Synthetic"), consent: { delete: "flag", remove: "forbid" } } },
        checkedUntil: { "111": "2026-10-01T00:00:00Z" },
      }),
    )
    const before = readFileSync(configPath(), "utf8")
    const rulesBefore = readFileSync(path, "utf8")
    expect((await cli(["config", "migrate", "--dry-run", "--json"])).code).toBe(0)
    expect(readFileSync(configPath(), "utf8")).toBe(before)
    expect(readFileSync(path, "utf8")).toBe(rulesBefore)
    expect((await cli(["config", "migrate", "--json"])).code).toBe(0)
    expect(resolveSettings({ profile: "home" }).serve).toBe(false)
    expect(levelFor(resolveSettings({ profile: "work" }).permissions, "messages.send").level).toBe("readonly")
    expect(levelFor(resolveSettings({ profile: "home" }).permissions, "messages.unpin").level).toBe("allow")
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      groups: { "111": { consent: { delete: "ask", remove: "deny" } } },
      checkedUntil: { "111": "2026-10-01T00:00:00Z" },
    })
    expect((await cli(["work", "config", "set", "readOnly", "false", "--json"])).code).toBe(2)
    expect(JSON.parse((await cli(["config", "migrate", "--json"])).stdout).changed).toBe(false)
  })
})

it("keeps a native read child override and checks nested native read groups", async () => {
  save({ profiles: { work: { permissions: { account: "deny", "account.show": "allow", chats: "deny" } } } })
  const { max, environment } = scripted()
  const client = contextFor({ profile: "work" }, environment).createClient()
  try {
    expect(() => client.chats.members.list("111")).toThrow("denies chats.members.list")
    expect(max.sent).toEqual([])
    expect(await client.account.me()).toMatchObject({ id: "10000001" })
  } finally {
    await client.close()
  }
})

it("allows migration preview under a profile lock and refuses the whole-file write", async () => {
  save({ profiles: { work: { readOnly: true } } })
  const before = readFileSync(configPath(), "utf8")
  process.env.MAX_PROFILE_LOCK = "work"
  try {
    expect((await cli(["config", "migrate", "--json"])).code).toBe(5)
    expect((await cli(["config", "migrate", "--dry-run", "--json"])).code).toBe(0)
    expect(readFileSync(configPath(), "utf8")).toBe(before)
  } finally {
    delete process.env.MAX_PROFILE_LOCK
  }
})
