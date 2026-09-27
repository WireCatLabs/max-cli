import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const user = (id: number, first: string, username?: string) =>
  JSON.stringify({
    user_id: id,
    first_name: first,
    is_bot: false,
    last_activity_time: 1,
    ...(username && { username }),
  })
const ANN = user(42, "Ann", "ann")
const BOB = user(43, "Bob")
const ANNA = user(44, "Anna")
const BOTS: Record<string, string> = {
  first: `{"user_id": 1, "first_name": "First", "username": "first_bot", "is_bot": true, "last_activity_time": 1}`,
  second: `{"user_id": 2, "first_name": "Second", "username": "second_bot", "is_bot": true, "last_activity_time": 1}`,
}

let clock = 1758888000000
const said = (sender: string, chatId: number, chatType: string, mid: string, text: string) =>
  `{"sender": ${sender}, "recipient": {"chat_id": ${chatId}, "chat_type": "${chatType}"}, "timestamp": ${clock--},
    "body": {"mid": "${mid}", "seq": 1, "text": "${text}"}}`

// Newest first, as MAX answers.
const TEAM = [said(BOB, -100, "chat", "mid.b1", "bob in team"), said(ANN, -100, "chat", "mid.a1", "ann in team")]
const HISTORY: Record<string, Record<string, string[]>> = {
  first: {
    "-100": TEAM,
    "500": [
      said(BOTS.first as string, 500, "dialog", "mid.d2", "hello Ann \\u001b[2J"),
      said(ANN, 500, "dialog", "mid.d1", "hi bot"),
    ],
    "-400": [said(ANNA, -400, "chat", "mid.n1", "anna here")],
  },
  second: {
    "-200": [said(ANN, -200, "chat", "mid.a2", "ann elsewhere"), said(BOB, -200, "chat", "mid.b2", "bob elsewhere")],
    "-300": [said(ANN, -300, "chat", "mid.a3", "ann alone")],
    "-100": TEAM,
  },
}

let server: Server
let botUrl: string
const requests: string[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    const bot = String(request.headers.authorization)
    const url = new URL(request.url ?? "/", "http://stub")
    requests.push(`${request.method} ${request.url}`)
    const answer =
      url.pathname === "/me"
        ? BOTS[bot]
        : url.pathname === "/messages"
          ? `{"messages": [${(HISTORY[bot]?.[url.searchParams.get("chat_id") ?? ""] ?? []).join(",")}]}`
          : undefined
    response.writeHead(answer ? 200 : 404, { "content-type": "application/json" })
    response.end(answer ?? `{"code": "not.found", "message": "nothing here"}`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

let keyring: KeyringStore

const max = async (argv: string[]) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}
const json = async (argv: string[]) => {
  const { code, stdout, stderr } = await max([...argv, "--json"])
  expect(stderr).toBe("")
  expect(code).toBe(0)
  return JSON.parse(stdout)
}

beforeAll(async () => {
  keyring = memoryKeyring()
  for (const bot of Object.keys(HISTORY)) {
    new BotTokenStore({ profile: bot, keyring }).write(bot)
    for (const chat of Object.keys(HISTORY[bot] ?? {})) await json([bot, "bot", "messages", "list", chat])
  }
})
beforeEach(() => {
  requests.length = 0
})

describe("max bot people show", () => {
  it("shows a person by @username: the chats they wrote in and their private chat, from the local copy", async () => {
    const card = await json(["first", "bot", "people", "show", "@ann"])
    expect(card).toMatchObject({ id: "42", name: "Ann", username: "ann" })
    expect(card.chats.map((chat: { id: string; kind: string }) => [chat.id, chat.kind])).toEqual([
      ["-100", "group"],
      ["500", "dialog"],
    ])
    expect(card.messages.map((message: { text: string }) => message.text)).toEqual(["hi bot", "hello Ann \u001b[2J"])
    expect(requests).toEqual([])
  })

  it("looks through every bot on this machine with --all-bots", async () => {
    const card = await json(["first", "bot", "people", "show", "42", "--all-bots"])
    expect(card.chats.map((chat: { id: string }) => chat.id).toSorted()).toEqual(["-100", "-200", "-300", "500"])
  })

  it("prints for a person without letting a message's escape codes reach the terminal", async () => {
    const streams = captureStreams()
    const code = await run(["first", "bot", "people", "show", "42", "--all-bots"], {
      streams,
      tty: true,
      botStore: (profile) => new BotTokenStore({ profile, keyring }),
      botUrl,
    })
    const stdout = streams.stdout.join("\n")
    expect(code).toBe(0)
    expect(stdout).toContain("hello Ann")
    expect(stdout).not.toContain("\u001b[2J")
  })

  it("refuses a name that matches two people, and lists them", async () => {
    const { code, stderr } = await max(["first", "bot", "people", "show", "An", "--json"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("42")
    expect(stderr).toContain("44")
  })

  it("re-reads the private chat from MAX with --refresh, in exactly one request", async () => {
    await json(["first", "bot", "people", "show", "@ann", "--refresh"])
    expect(requests).toEqual(["GET /messages?chat_id=500&count=20"])
  })
})

describe("max bot messages search --from", () => {
  it("finds what one person wrote, with or without text", async () => {
    const all = await json(["first", "bot", "messages", "search", "--from", "@ann"])
    expect(all.map((message: { id: string }) => message.id)).toEqual(["mid.a1", "mid.d1"])
    const some = await json(["first", "bot", "messages", "search", "team", "--from", "@ann", "--from", "Bob"])
    expect(some.map((message: { id: string }) => message.id)).toEqual(["mid.b1", "mid.a1"])
  })
})

describe("max bot messages between", () => {
  it("keeps only the chats every one of them wrote in, grouped by chat, oldest first", async () => {
    const answer = await json(["first", "bot", "messages", "between", "@ann", "Bob", "--all-bots"])
    expect(answer.basis).toBe("messages seen")
    expect(
      answer.chats.map((chat: { id: string; messages: { id: string }[] }) => [chat.id, chat.messages.map((m) => m.id)]),
    ).toEqual([
      ["-100", ["mid.a1", "mid.b1"]],
      ["-200", ["mid.b2", "mid.a2"]],
    ])
  })

  it("counts --limit per chat, so a busy chat does not hide the others", async () => {
    const answer = await json(["first", "bot", "messages", "between", "@ann", "Bob", "--all-bots", "--limit", "1"])
    expect(answer.chats.map((chat: { messages: unknown[] }) => chat.messages.length)).toEqual([1, 1])
    expect(answer.hasMore).toBe(true)
  })

  it("needs two people", async () => {
    expect((await max(["first", "bot", "messages", "between", "@ann", "--json"])).code).not.toBe(0)
  })
})
