import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@leemour/cli-core"
import type { DiagnosticEvent } from "@leemour/cli-messaging/cli"
import type { SendEntry, SendGuard } from "@leemour/cli-messaging/sends"
import { guardedWrite, SendJournal } from "@leemour/cli-messaging/sends"
import { Command } from "commander"
import { describe, expect, it } from "vitest"
import { provide } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { maxMessenger, overServer } from "./messenger.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const SHARED = [
  "profile",
  "json",
  "jsonl",
  "quiet",
  "detail",
  "trace",
  "color",
  "senderColors",
  "limit",
  "page",
  "all",
  "timeoutMs",
  "commandTimeoutMs",
  "record",
  "keepFailedRuns",
  "keepRunsForDays",
  "readOnly",
  "allow",
  "sendsPerHour",
  "updateCheck",
  "configPath",
  "configFound",
  "configuredProfiles",
  "sources",
] as const

const CONFIG = {
  defaultProfile: "work",
  defaults: { limit: 7, sendsPerHour: 3 },
  profiles: { work: { readOnly: true, allow: ["reaction", "read"], record: true }, home: {} },
}

describe("the MAX messenger's settings", () => {
  it.each([
    ["no flags", {}, {}],
    ["a profile flag", { profile: "home" }, {}],
    ["flags over the file", { limit: 2, json: true, trace: true, record: false }, {}],
    ["the environment", {}, { MAX_PROFILE: "home", MAX_TIMEOUT: "10s" }],
  ])("answer what max's own settings answer, with %s", (_, flags, env) => {
    const configDir = mkdtempSync(join(tmpdir(), "max-messenger-"))
    writeFileSync(join(configDir, "config.json"), JSON.stringify(CONFIG))

    const shared = maxMessenger.resolveSettings(flags, { env, configDir })
    const own = resolveSettings(flags, { env, configDir })

    for (const key of SHARED) expect([key, shared[key]]).toEqual([key, own[key]])
  })

  it("passes configured AI choices to shared commands with the owner's profile layers", () => {
    const configDir = mkdtempSync(join(tmpdir(), "max-ai-"))
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        profiles: {
          work: {
            embeddingProvider: "openai",
            embeddingModel: "synthetic-model",
            embeddingBaseUrl: "https://example.test/v1",
            embeddingDims: 128,
            analysisProvider: "anthropic",
          },
        },
      }),
    )
    const shared = maxMessenger.resolveSettings({ profile: "work" }, { configDir, env: {} })
    expect(shared).toMatchObject({
      embeddingProvider: "openai",
      embeddingModel: "synthetic-model",
      embeddingBaseUrl: "https://example.test/v1",
      embeddingDims: 128,
      analysisProvider: "anthropic",
    })
    expect(shared.configured.embeddingModel).toBe("synthetic-model")
  })

  it("carries --offline, which max's settings leave to the command", () => {
    const configDir = mkdtempSync(join(tmpdir(), "max-messenger-"))
    expect(maxMessenger.resolveSettings({ offline: true }, { configDir }).offline).toBe(true)
    expect(maxMessenger.resolveSettings({}, { configDir }).offline).toBe(false)
  })
})

const commandFor = (profile: string, answers: Record<number, Payload> = {}, refuse: Record<number, string> = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [{ id: 111, title: "Friends", type: "CHAT", lastEventTime: 1789776000000 }],
      },
      [Opcode.MSG_REACTION]: { reactionInfo: {} },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      ...answers,
    },
    refuse,
  })
  const program = new Command("max").option("--profile <name>").option("--no-serve")
  program.setOptionValue("profile", profile)
  program.setOptionValue("serve", false)
  const keyring = memoryKeyring()
  provide(program, {
    store: (name) => {
      const store = new SessionStore({ profile: name, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  })
  return { program, max }
}

describe("the MAX messenger's connection", () => {
  it("answers through MaxClient with no guard of its own, and reports MAX's frames to the run", async () => {
    const { program, max } = commandFor("m-connect")
    const events: DiagnosticEvent[] = []
    const adapter = await maxMessenger.connect(program, {} as never, { events: (event) => events.push(event) })

    expect(await adapter.resolve("Friends")).toMatchObject({ id: "111", title: "Friends" })
    await adapter.react?.("111", "116762160362694583", "👍")
    await adapter.close()

    expect(max.sent.map(({ opcode }) => opcode)).toContain(Opcode.MSG_REACTION)
    expect(events.some((event) => event.event === "request" && event.opcode === Opcode.LOGIN)).toBe(true)
    expect(new SendJournal(sendsPathFor("m-connect")).entries()).toEqual([])
  })

  it("guards with the profile's own guard, journaling what the command did", async () => {
    const { program } = commandFor("m-guard")
    const guard = maxMessenger.guard?.(program, maxMessenger.resolveSettings({ profile: "m-guard" }), () => {})

    guard?.check({ chatId: "111", kind: "reaction", operationId: "op-1" })
    guard?.record({ chatId: "111", kind: "reaction", outcome: "sent", operationId: "op-1" })

    expect(new SendJournal(sendsPathFor("m-guard")).entries()).toMatchObject([
      { chatId: "111", kind: "reaction", outcome: "sent", operationId: "op-1" },
    ])
  })
  it("consumes the applied receipt only for its operation", async () => {
    const profile = "m-applied"
    const { program } = commandFor(profile, { [Opcode.SESSIONS_CLOSE]: {} }, { [Opcode.SESSIONS_INFO]: "login.token" })
    program.setOptionValue("yes", true)
    const adapter = await maxMessenger.connect(program, {} as never)
    const guard = maxMessenger.guard?.(program, maxMessenger.resolveSettings({ profile }), () => {})
    if (!guard) throw new Error("guard missing")
    try {
      await expect(
        guardedWrite(
          guard,
          { operationId: "applied-1", chatId: null, kind: "account", action: "sessions-end" },
          async () => {
            if (!adapter.endOtherSessions) throw new Error("adapter capability missing")
            return adapter.endOtherSessions()
          },
        ),
      ).rejects.toMatchObject({ code: "authentication_error" })
      guard.record({ operationId: "other-2", chatId: null, kind: "account", action: "sessions-end", outcome: "failed" })
      guard.record({
        operationId: "applied-1",
        chatId: null,
        kind: "account",
        action: "sessions-end",
        outcome: "failed",
      })
      expect(new SendJournal(sendsPathFor(profile)).entries()).toMatchObject([
        { operationId: "applied-1", outcome: "sent" },
        { operationId: "other-2", outcome: "failed" },
        { operationId: "applied-1", outcome: "failed" },
      ])
    } finally {
      await adapter.close()
    }
  })
})

describe("a guard over max serve", () => {
  const recording = () => {
    const asked: unknown[] = []
    const recorded: string[] = []
    const guard: SendGuard = {
      check: (_request, options) => {
        asked.push(options)
      },
      record: (entry) => {
        recorded.push(entry.outcome)
      },
    }
    return { guard, asked, recorded }
  }
  const outcomes: Omit<SendEntry, "at" | "profile">[] = [
    { chatId: "1", outcome: "refused" },
    { chatId: "1", outcome: "sent" },
  ]

  it("reserves nothing and records only its refusals when the server journals", () => {
    const { guard, asked, recorded } = recording()
    const over = overServer(guard, () => ({ journals: true }))
    over.check({ chatId: "1" })
    for (const entry of outcomes) over.record(entry)

    expect(asked).toEqual([{ reserve: false }])
    expect(recorded).toEqual(["refused"])
  })

  it("records everything on its own connection, or when the server fell back to one", () => {
    for (const server of [() => undefined, () => ({ journals: false })]) {
      const { guard, recorded } = recording()
      const over = overServer(guard, server)
      for (const entry of outcomes) over.record(entry)
      expect(recorded).toEqual(["refused", "sent"])
    }
  })
})
