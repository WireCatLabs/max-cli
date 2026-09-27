import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { JoinLog } from "../bot/joins.js"
import { ModerationRules, moderationPathFor } from "../moderation/rules.js"
import { run } from "../program.js"

const BOT = `{"user_id": 900, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1}`
const now = Date.now()
const raw = (mid: string, sender: number, name: string, text: string, minutesAgo: number) =>
  `{"sender": {"user_id": ${sender}, "first_name": "${name}", "is_bot": false, "last_activity_time": 1},
    "recipient": {"chat_id": -100, "chat_type": "chat"}, "timestamp": ${now - minutesAgo * 60_000},
    "body": {"mid": "${mid}", "seq": 1, "text": "${text}"}}`
const INVITE = raw("mid.2", 42, "Spammer", "join https://max.ru/join/other", 10)
const HELLO = raw("mid.1", 43, "Ann", "hello", 20)
const ADMIN = raw("mid.3", 7, "Admin", "https://example.com/rules", 5)

let server: Server
let botUrl: string
const calls: string[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume()
    request.on("end", () => {
      const url = request.url ?? ""
      calls.push(`${request.method} ${url}`)
      const send = (body: string) => {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(body)
      }
      if (url === "/me") return send(BOT)
      if (url.startsWith("/messages?")) return send(`{"messages": [${ADMIN}, ${INVITE}, ${HELLO}]}`)
      if (url === "/messages/mid.2") return send(INVITE)
      if (url.startsWith("/chats/-100/members/admins")) return send(`{"members": [{"user_id": 7}]}`)
      if (request.method === "DELETE") return send(`{"success": true}`)
      response.writeHead(404, { "content-type": "application/json" })
      response.end(`{"code": "not.found", "message": "nothing here"}`)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.closeAllConnections()
  return new Promise<void>((resolve) => server.close(() => resolve()))
})

let keyring: KeyringStore
beforeEach(() => {
  keyring = memoryKeyring()
  calls.length = 0
})

const bot = async (profile: string, argv: string[]) => {
  new BotTokenStore({ profile, keyring }).write("bot-token")
  const streams = captureStreams()
  const code = await run([profile, "bot", ...argv], {
    streams,
    tty: false,
    botStore: (name) => new BotTokenStore({ profile: name, keyring }),
    botUrl,
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
const rows = (stdout: string) => JSON.parse(stdout).items as { rule: string; action: string; outcome: string }[]
const deletes = () => calls.filter((call) => call.startsWith("DELETE"))

describe("max bot chats check", () => {
  it("with no rules, only reports, leaves admins alone, and says where joins come from", async () => {
    const { code, stdout, stderr } = await bot("bc-none", ["chats", "check", "-100", "--json"])

    expect(code).toBe(0)
    expect(rows(stdout)).toEqual([expect.objectContaining({ rule: "invites", action: "report", outcome: "reported" })])
    expect(stderr).toContain("no rules yet")
    expect(stderr).toContain("bot updates watch")
    expect(deletes()).toEqual([])
  })

  it("deletes what a rule allows, and bans on removal unless --no-ban", async () => {
    const rules = new ModerationRules(moderationPathFor("bc-act"))
    rules.set("-100", null, "invites", "remove")
    rules.set("-100", null, "consent.remove", "allow")

    const banned = await bot("bc-act", [
      "chats",
      "check",
      "-100",
      "--since",
      new Date(now - 3_600_000).toISOString(),
      "--json",
    ])
    const kept = await bot("bc-act", [
      "chats",
      "check",
      "-100",
      "--since",
      new Date(now - 3_600_000).toISOString(),
      "--no-ban",
      "--json",
    ])

    expect(rows(banned.stdout)).toEqual([expect.objectContaining({ action: "remove", outcome: "done" })])
    expect(rows(kept.stdout)).toEqual([expect.objectContaining({ action: "remove", outcome: "done" })])
    const removals = deletes().filter((call) => call.includes("/members"))
    expect(removals).toHaveLength(2)
    expect(removals[0]).toContain("user_id=42")
    expect(removals[0]).toContain("block=true")
    expect(removals[1]).not.toContain("block")
  })

  it("deletes a message at level flag only with --allow-dangerous", async () => {
    const rules = new ModerationRules(moderationPathFor("bc-flag"))
    rules.set("-100", null, "invites", "delete")

    const planned = await bot("bc-flag", ["chats", "check", "-100", "--json"])
    const done = await bot("bc-flag", ["chats", "check", "-100", "--allow-dangerous", "--json"])

    expect(rows(planned.stdout)[0]).toMatchObject({ outcome: "planned" })
    expect(rows(done.stdout)[0]).toMatchObject({ outcome: "done" })
    expect(deletes()).toEqual(["DELETE /messages?message_id=mid.2"])
  })

  it("judges joins kept by updates watch", async () => {
    new ModerationRules(moderationPathFor("bc-joins")).set("-100", null, "blocked", "55")
    JoinLog.for("bc-joins").add([{ chatId: "-100", userId: "55", name: "Blocked One", event: "add", at: now - 60_000 }])

    const { stdout, stderr } = await bot("bc-joins", ["chats", "check", "-100", "--json"])

    expect(rows(stdout)).toContainEqual(expect.objectContaining({ kind: "member", rule: "blocked", personId: "55" }))
    expect(stderr).not.toContain("no joins kept")
  })
})

describe("max bot chats rules", () => {
  it("sets and shows a chat's rules by the bot's chat id", async () => {
    const set = await bot("br-set", ["chats", "rules", "set", "-100", "links", "delete", "--json"])
    const shown = await bot("br-set", ["chats", "rules", "show", "-100", "--json"])

    expect(set.code).toBe(0)
    expect(JSON.parse(shown.stdout)).toMatchObject({ chatId: "-100", saved: true, rules: { links: "delete" } })
  })
})
