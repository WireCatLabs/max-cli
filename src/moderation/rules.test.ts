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
    })
    expect(saved.newAccount).toEqual({ days: 7, action: "report" })
  })

  it("reads the levels cli-messaging writes when a bot of the same name changes its rules", () => {
    const rules = fresh()
    const consent = { delete: "ask", remove: "deny" }
    writeFileSync(rules.path, JSON.stringify({ groups: { "-1": { ...defaultRules("Team"), consent } } }))

    expect(rules.read("-1")?.consent).toEqual({ delete: "confirm", remove: "forbid" })
  })

  it("loads a file written when join requests had rules, and drops them on the next write", () => {
    const rules = fresh()
    const old = {
      ...defaultRules("Team"),
      requests: "both",
      consent: { delete: "flag", remove: "flag", accept: "allow", decline: "allow" },
    }
    writeFileSync(rules.path, JSON.stringify({ groups: { "-1": old } }))

    expect(rules.read("-1")).toEqual(defaultRules("Team"))
    rules.set("-1", "Team", "links", "delete")
    const written = JSON.parse(readFileSync(rules.path, "utf8")).groups["-1"]
    expect(written.requests).toBeUndefined()
    expect(written.consent).toEqual({ delete: "flag", remove: "flag" })
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

    expect(before.json).toMatchObject({
      chatId: "-70000000000001",
      saved: false,
      rules: { ...defaultRules("Team"), consent: { delete: "ask", remove: "ask" } },
    })
    expect(set.code).toBe(0)
    expect(set.json).toMatchObject({ saved: true, rules: { newAccount: { days: 3, action: "report" } } })
    expect(new ModerationRules(moderationPathFor("ru-cmd")).read("-70000000000001")?.title).toBe("Team")
  })

  it("`unset` puts one rule back to its default and keeps the others", async () => {
    const env = environment()
    await rules(["ru-unset", "chats", "rules", "set", "Team", "newAccount.days", "3", "--json"], env)
    await rules(["ru-unset", "chats", "rules", "set", "Team", "links", "delete", "--json"], env)

    const unset = await rules(["ru-unset", "chats", "rules", "unset", "Team", "newAccount.days", "--json"], env)

    expect(unset.code).toBe(0)
    expect(unset.json.rules.newAccount.days).toBe(defaultRules("Team").newAccount.days)
    expect(new ModerationRules(moderationPathFor("ru-unset")).read("-70000000000001")).toMatchObject({
      newAccount: { days: defaultRules("Team").newAccount.days },
      links: "delete",
    })
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
