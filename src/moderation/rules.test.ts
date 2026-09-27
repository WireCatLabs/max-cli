import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "../commands/context.js"
import { Opcode } from "../generated/opcodes.generated.js"
import { run } from "../program.js"
import { Connection } from "../protocol/connection.js"
import { SessionStore } from "../session/store.js"
import { mockMax } from "../testing/mock-max.js"
import { defaultRules, ModerationRules, moderationPathFor } from "./rules.js"

const fresh = () => new ModerationRules(join(mkdtempSync(join(tmpdir(), "max-rules-")), "rules.json"))

describe("ModerationRules", () => {
  it("writes every rule with its default on the first change, then the change", () => {
    const rules = fresh()

    const saved = rules.set("-1", "Team", "invites", "delete")

    expect(saved).toEqual({ ...defaultRules("Team"), invites: "delete" })
    expect(JSON.parse(readFileSync(rules.path, "utf8")).groups["-1"].consent).toEqual({
      delete: "flag",
      remove: "flag",
      accept: "flag",
      decline: "flag",
    })
    expect(saved.newAccount).toEqual({ days: 7, action: "report" })
  })

  it("reads lists and numbers from text, and puts a rule back with unset", () => {
    const rules = fresh()

    expect(rules.set("-1", null, "trusted", "30000003, 30000004").trusted).toEqual(["30000003", "30000004"])
    expect(rules.set("-1", null, "flood.messages", "10").flood).toEqual({ messages: 10, minutes: 1, action: "report" })
    expect(rules.set("-1", null, "consent.remove", "confirm").consent.remove).toBe("confirm")
    expect(rules.unset("-1", null, "consent.remove").consent.remove).toBe("flag")
    expect(rules.read("-1")?.trusted).toEqual(["30000003", "30000004"])
  })

  it("refuses an unknown rule or a value it does not take, and writes nothing", () => {
    const rules = fresh()

    expect(() => rules.set("-1", null, "spam", "delete")).toThrow(/no rule spam — one of: trusted/)
    expect(() => rules.set("-1", null, "consent.delete", "sometimes")).toThrow(/forbid\|flag\|confirm\|allow/)
    expect(() => rules.set("-1", null, "flood.minutes", "0")).toThrow(/1 or more/)
    expect(() => rules.set("-1", null, "blocked", "Bob")).toThrow(/person ids/)
    expect(rules.read("-1")).toBeUndefined()
  })

  it("refuses a hand-edited file that does not check out, naming where", () => {
    const rules = fresh()
    rules.set("-1", null, "links", "delete")
    const edited = JSON.parse(readFileSync(rules.path, "utf8"))
    edited.groups["-1"].links = "ban"
    writeFileSync(rules.path, JSON.stringify(edited))

    expect(() => rules.read("-1")).toThrow(/groups\.-1\.links/)
  })
})

describe("max chats rules", () => {
  const environment = (): Environment => {
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: {
          profile: { contact: { id: 10000001 } },
          chats: [{ id: -70000000000001, title: "Team", type: "CHAT" }],
        },
      },
    })
    const keyring = memoryKeyring()
    return {
      store: (profile) => {
        const store = new SessionStore({ profile, keyring })
        store.writeToken("a-token")
        return store
      },
      connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    }
  }

  const rules = async (argv: string[], env: Environment) => {
    const streams = captureStreams()
    const code = await run(argv, { ...env, streams, tty: false })
    return { code, json: JSON.parse(streams.stdout.join("\n") || "null"), stderr: streams.stderr.join("\n") }
  }

  it("shows the defaults unsaved, then saves them all with one change", async () => {
    const env = environment()

    const before = await rules(["ru-cmd", "chats", "rules", "show", "Team", "--json"], env)
    const set = await rules(["ru-cmd", "chats", "rules", "set", "Team", "newAccount.days", "3", "--json"], env)

    expect(before.json).toMatchObject({ chatId: "-70000000000001", saved: false, rules: defaultRules("Team") })
    expect(set.code).toBe(0)
    expect(set.json).toMatchObject({ saved: true, rules: { newAccount: { days: 3, action: "report" } } })
    expect(new ModerationRules(moderationPathFor("ru-cmd")).read("-70000000000001")?.title).toBe("Team")
  })

  it("refuses a bad value with the values it takes", async () => {
    const { code, stderr } = await rules(
      ["ru-bad", "chats", "rules", "set", "Team", "links", "ban", "--json"],
      environment(),
    )

    expect(code).not.toBe(0)
    expect(stderr).toContain("report|delete|remove")
  })
})
