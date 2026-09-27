import { mkdtempSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@leemour/cli-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"

const TOKEN = "bot-token"
const BIG = "9007199254740993"
const BOT = `{"user_id": 1, "first_name": "Helper", "username": "helper_bot", "is_bot": true, "last_activity_time": 1,
  "commands": [{"name": "start", "description": "Начать"}]}`
const POST = `{"sender": {"user_id": 1, "first_name": "Helper", "is_bot": true, "last_activity_time": 1},
  "recipient": {"chat_id": -100, "chat_type": "channel"}, "timestamp": 1, "body": {"mid": "mid.9", "seq": 9, "text": "post"}}`
const sent = (chat: string) =>
  `{"message": {"recipient": {"chat_id": ${chat}, "chat_type": "chat"}, "timestamp": 1, "body": {"mid": "mid.10", "seq": 10}}}`

let server: Server
let botUrl: string
const requests: { method?: string; url?: string; body: string; headers: Record<string, unknown> }[] = []
let subscriptions: string[] = []
let notReady = 0

const answer = (method: string, url: string, body: string): [number, string] => {
  if (url === "/me") return [200, BOT]
  if (url.startsWith("/updates?")) return [200, `{"updates": [], "marker": 1}`]
  if (method === "PATCH" && url === "/me/commands") return [200, BOT]
  if (method === "POST" && url.startsWith("/uploads?type=")) {
    const type = new URL(url, botUrl).searchParams.get("type")
    const token = type === "video" || type === "audio" ? `, "token": "step-one-token"` : ""
    return [200, `{"url": "${botUrl}/upload-host/${type}?sig=secret-signature"${token}}`]
  }
  if (url.startsWith("/upload-host/image")) return [200, `{"photos": {"a": {"token": "photo-token"}}}`]
  if (url.startsWith("/upload-host/file")) return [200, `{"token": "file-token"}`]
  if (url.startsWith("/upload-host/")) return [200, "<retval>1</retval>"]
  if (method === "POST" && (url === "/messages?chat_id=34871122" || url === "/messages?chat_id=-404")) {
    return [404, `{"code": "chat.not.found", "message": "Chat not found"}`]
  }
  if (method === "POST" && url.startsWith("/messages?")) {
    if (body.includes("attachments") && notReady > 0) {
      notReady--
      return [400, `{"code": "attachment.not.ready", "message": "Key: errors.process.attachment.file.not.processed"}`]
    }
    return [200, sent(url.includes("user_id") ? "777" : "-100")]
  }
  if (url === "/messages/mid.9") return [200, POST]
  if (url.startsWith("/messages/mid.9/comments")) {
    return method === "GET" ? [200, `{"messages": [{"id": "c1", "text": "first"}]}`] : [200, `{"success": true}`]
  }
  if (url.startsWith("/chats/-100/members?count=")) {
    return [200, `{"members": [{"user_id": ${BIG}, "name": "Big"}], "marker": 7}`]
  }
  if (url === "/chats/-100/members/admins" && method === "GET") return [200, `{"members": []}`]
  if (url.startsWith("/chats/-100/members")) return [200, `{"success": true}`]
  if (url.startsWith("/answers?")) return [200, `{"success": true}`]
  if (url === "/subscriptions" && method === "GET") {
    return [200, JSON.stringify({ subscriptions: subscriptions.map((one) => ({ url: one, time: 1 })) })]
  }
  if (url === "/subscriptions" && method === "POST") {
    subscriptions.push((JSON.parse(body) as { url: string }).url)
    return [200, `{"success": true}`]
  }
  if (url.startsWith("/subscriptions?url=") && method === "DELETE") {
    const gone = new URL(url, botUrl).searchParams.get("url")
    subscriptions = subscriptions.filter((one) => one !== gone)
    return [200, `{"success": true}`]
  }
  return [404, `{"code": "not.found", "message": "nothing"}`]
}

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body, headers: request.headers })
      const [status, text] = answer(request.method ?? "GET", request.url ?? "", body)
      response.writeHead(status, { "content-type": text.startsWith("<") ? "application/xml" : "application/json" })
      response.end(text)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

let keyring: KeyringStore
beforeEach(() => {
  keyring = memoryKeyring()
  requests.length = 0
  subscriptions = []
  notReady = 0
  for (const name of ["default", "team"]) new BotTokenStore({ profile: name, keyring }).write(TOKEN)
})

const max = async (argv: string[], ask?: () => Promise<string>) => {
  const streams = captureStreams()
  const code = await run(argv, {
    streams,
    tty: false,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    botUrl,
    ...(ask ? { ask } : {}),
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

const writes = () => requests.filter((request) => request.method !== "GET")
const journal = async (profile = "default") =>
  JSON.parse((await max([profile, "bot", "sends", "list", "--json"])).stdout) as Record<string, unknown>[]

const file = (name: string, content = "bytes") => {
  const path = join(mkdtempSync(join(tmpdir(), "bot-upload-")), name)
  writeFileSync(path, content)
  return path
}

describe("max bot messages send to a positive number", () => {
  it("says the number is probably a person, and keeps MAX's code and exit", async () => {
    const { code, stdout, stderr } = await max(["bot", "messages", "send", "34871122", "hi", "--json"])
    expect(code).toBe(6)
    expect(stdout).toBe("")
    const error = JSON.parse(stderr).error
    expect(error.code).toBe("not_found")
    expect(error.message).toContain("use user:34871122")
  })

  it("gives no such hint for a group chat", async () => {
    const { stderr } = await max(["bot", "messages", "send", "-404", "hi", "--json"])
    expect(JSON.parse(stderr).error.code).toBe("not_found")
    expect(stderr).not.toContain("user:")
  })
})

describe("max bot api get-updates", () => {
  it("sends --poll-timeout as the timeout parameter, leaving --timeout to the command", async () => {
    const { stderr } = await max(["bot", "api", "get-updates", "--poll-timeout", "0", "--limit", "5", "--json"])
    expect(stderr).toBe("")
    expect(requests.at(-1)?.url).toBe("/updates?limit=5&timeout=0")
  })
})

describe("max bot messages send --file", () => {
  it("uploads an image without the bot token and sends it with the photo tokens", async () => {
    const { code } = await max(["bot", "messages", "send", "-100", "look", "--file", file("cat.png"), "--json"])
    expect(code).toBe(0)
    const upload = requests.find((request) => request.url?.startsWith("/upload-host/image"))
    expect(upload?.headers.authorization).toBeUndefined()
    expect(upload?.headers["content-type"]).toMatch(/^multipart\/form-data/)
    expect(upload?.body).toContain('name="data"; filename="cat.png"')
    expect(JSON.parse(writes().at(-1)?.body ?? "{}")).toEqual({
      text: "look",
      attachments: [{ type: "image", payload: { photos: { a: { token: "photo-token" } } } }],
    })
    expect((await journal()).at(-1)).toMatchObject({ chatId: "-100", kind: "message", outcome: "sent" })
  })

  it("names a video by the token of step one, and waits while MAX says it is not ready", async () => {
    notReady = 1
    const before = (await journal()).length
    const { code, stdout } = await max(["bot", "messages", "send", "-100", "--file", file("clip.mp4"), "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout).id).toBe("mid.10")
    const sends = requests.filter((request) => request.method === "POST" && request.url?.startsWith("/messages?"))
    expect(sends).toHaveLength(2)
    expect(JSON.parse(sends[1]?.body ?? "{}").attachments).toEqual([
      { type: "video", payload: { token: "step-one-token" } },
    ])
    expect(await journal()).toHaveLength(before + 1)
  })

  it("refuses a chat off the list before uploading anything", async () => {
    await max(["team", "bot", "recipients", "add", "-200"])
    requests.length = 0
    const { code } = await max(["team", "bot", "messages", "send", "-100", "--file", file("a.pdf"), "--json"])
    expect(code).toBe(7)
    expect(writes()).toHaveLength(0)
  })

  it("never shows the upload URL, whatever goes wrong", async () => {
    const { code, stderr } = await max(["bot", "messages", "send", "-100", "--file", "/no/such/file.png", "--json"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("no file at")
    expect(stderr).not.toContain("secret-signature")
  })
})

describe("max bot uploads put", () => {
  it("prints the attachment for a file and journals the upload", async () => {
    const { code, stdout, stderr } = await max(["bot", "uploads", "put", file("notes.txt"), "--json"])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ type: "file", payload: { token: "file-token" } })
    expect(stdout).not.toContain("secret-signature")
    expect((await journal()).at(-1)).toMatchObject({ kind: "account", chatId: null, outcome: "sent" })
  })
})

describe("max bot members and admins", () => {
  it("lists members with ids above 2^53 as their digits and the marker to continue from", async () => {
    const { stdout } = await max(["bot", "members", "list", "-100", "--limit", "5", "--json"])
    expect(JSON.parse(stdout)).toEqual({ members: [{ user_id: BIG, name: "Big" }], marker: 7 })
    expect(requests.at(-1)?.url).toBe("/chats/-100/members?count=5")
  })

  it("adds people with their ids unquoted and exact, through the recipient list", async () => {
    expect((await max(["bot", "members", "add", "-100", BIG, "42", "--json"])).code).toBe(0)
    expect(writes().at(-1)?.body).toBe(`{"user_ids": [${BIG},42]}`)
    expect((await max(["bot", "members", "add", "-100", "12a", "--json"])).code).toBe(2)
    await max(["team", "bot", "recipients", "add", "-200"])
    expect((await max(["team", "bot", "members", "remove", "-100", "42", "--json"])).code).toBe(7)
  })

  it("makes an admin from a comma list of permissions, and refuses one MAX does not know", async () => {
    const ok = await max(["bot", "admins", "add", "-100", BIG, "--permissions", "write,pin_message", "--json"])
    expect(ok.code).toBe(0)
    expect(writes().at(-1)?.body).toBe(`{"admins": [{"user_id": ${BIG}, "permissions": ["write","pin_message"]}]}`)
    const bad = await max(["bot", "admins", "add", "-100", "5", "--permissions", "write,rule", "--json"])
    expect(bad.code).toBe(2)
    expect(bad.stderr).toContain("not rule")
    expect((await max(["bot", "admins", "remove", "-100", "5", "--json"])).code).toBe(0)
    expect(writes().at(-1)).toMatchObject({ method: "DELETE", url: "/chats/-100/members/admins/5" })
  })
})

describe("max bot comments and callbacks", () => {
  it("comments under a post in a chat on the list, and never journals the text", async () => {
    expect((await max(["bot", "comments", "list", "mid.9", "--json"])).stdout).toContain("first")
    expect((await max(["bot", "comments", "send", "mid.9", "a secret comment", "--json"])).code).toBe(0)
    expect(writes().at(-1)).toMatchObject({ method: "POST", url: "/messages/mid.9/comments" })
    const row = (await journal()).at(-1)
    expect(row).toMatchObject({ chatId: "-100", kind: "message", outcome: "sent" })
    expect(JSON.stringify(row)).not.toContain("secret comment")
    await max(["team", "bot", "recipients", "add", "-200"])
    expect((await max(["team", "bot", "comments", "delete", "mid.9", "c1", "--json"])).code).toBe(7)
  })

  it("answers a button with a notification", async () => {
    expect((await max(["bot", "callbacks", "answer", "cb.1", "--json"])).code).toBe(2)
    expect((await max(["bot", "callbacks", "answer", "cb.1", "--notification", "Готово", "--json"])).code).toBe(0)
    expect(writes().at(-1)).toMatchObject({ url: "/answers?callback_id=cb.1" })
    expect(JSON.parse(writes().at(-1)?.body ?? "{}")).toEqual({ notification: "Готово" })
  })
})

describe("max bot commands", () => {
  it("lists the menu from /me and replaces it", async () => {
    expect(JSON.parse((await max(["bot", "commands", "list", "--json"])).stdout)).toEqual([
      { name: "start", description: "Начать" },
    ])
    expect(
      (await max(["bot", "commands", "set", "start=Начать", "/help=Помощь = и всё", "ping", "--json"])).stderr,
    ).toBe("")
    expect(JSON.parse(writes().at(-1)?.body ?? "{}")).toEqual({
      commands: [
        { name: "start", description: "Начать" },
        { name: "help", description: "Помощь = и всё" },
        { name: "ping" },
      ],
    })
    await max(["bot", "commands", "clear", "--json"])
    expect(JSON.parse(writes().at(-1)?.body ?? "{}")).toEqual({ commands: [] })
  })
})

describe("max bot webhooks", () => {
  it("sets one with a secret from the prompt, refuses a second unless --add, and deletes", async () => {
    const set = await max(
      ["bot", "webhooks", "set", "https://example.org/hook", "--secret-stdin", "--types", "message_created", "--json"],
      async () => "very-secret-1",
    )
    expect(set.stderr).toBe("")
    expect(set.code).toBe(0)
    expect(JSON.parse(writes().at(-1)?.body ?? "{}")).toEqual({
      url: "https://example.org/hook",
      secret: "very-secret-1",
      update_types: ["message_created"],
    })
    expect(set.stdout + set.stderr).not.toContain("very-secret-1")
    const second = await max(["bot", "webhooks", "set", "https://example.org/other", "--json"])
    expect(second.code).toBe(7)
    expect(JSON.parse(second.stderr).error.message).toContain("https://example.org/hook")
    expect((await max(["bot", "webhooks", "set", "https://example.org/other", "--add", "--json"])).code).toBe(0)
    const left = await max(["bot", "webhooks", "delete", "https://example.org/hook", "--json"])
    expect(JSON.parse(left.stdout)).toEqual([{ url: "https://example.org/other", time: 1 }])
    const rows = await journal()
    expect(JSON.stringify(rows)).not.toContain("very-secret-1")
  })

  it("refuses a profile that may not set one before asking for the secret", async () => {
    await max(["ro", "config", "set", "readOnly", "true"])
    new BotTokenStore({ profile: "ro", keyring }).write(TOKEN)
    let asked = false
    const refused = await max(
      ["ro", "bot", "webhooks", "set", "https://example.org/hook", "--secret-stdin"],
      async () => {
        asked = true
        return "very-secret-1"
      },
    )
    expect(refused.code).toBe(5)
    expect(asked).toBe(false)
  })
})
