import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
import { BotTokenStore } from "../bot/auth.js"
import { run } from "../program.js"
import { recipientListFor } from "../sends.js"

let server: Server, botUrl: string
let keyring = memoryKeyring()
const requests: URL[] = []
const big = "9007199254740993"
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", botUrl)
    requests.push(url)
    const data = url.pathname.endsWith("/members")
      ? { members: [{ user_id: big, first_name: "Synthetic" }], marker: url.searchParams.has("user_ids") ? null : 7 }
      : { messages: [{ body: { mid: "mid.c1", text: "Synthetic" }, timestamp: 1 }] }
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify(data))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  botUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
beforeEach(() => {
  requests.length = 0
  keyring = memoryKeyring()
  new BotTokenStore({ profile: "querytest", keyring }).write("synthetic")
})
const call = async (...args: string[]) => {
  const streams = captureStreams()
  const code = await run(["querytest", ...args, "--json"], {
    streams,
    tty: false,
    botUrl,
    botStore: (profile) => new BotTokenStore({ profile, keyring }),
    sleep: async () => {},
  })
  const output = streams.stdout.join("")
  return { code, body: output ? JSON.parse(output) : undefined, stderr: streams.stderr.join("") }
}
it("selects a precise member id at the provider, without ignored paging parameters", async () => {
  const result = await call("bot", "chats", "members", "list", "-100", `user_id:${big}`, "--limit", "1")
  expect(result.code, result.stderr).toBe(0)
  expect(requests.at(-1)?.searchParams.get("user_ids")).toBe(big)
  expect(requests.at(-1)?.searchParams.has("count")).toBe(false)
  expect(requests.at(-1)?.searchParams.has("marker")).toBe(false)
  expect(result.body.items[0].user_id).toBe(big)
})
it("preserves unfiltered member paging", async () => {
  const result = await call("bot", "chats", "members", "list", "-100", "--cursor", "4", "--limit", "2")
  expect(result.code, result.stderr).toBe(0)
  expect(requests.at(-1)?.searchParams.get("count")).toBe("2")
  expect(requests.at(-1)?.searchParams.get("marker")).toBe("4")
  expect(result.body.page.next_cursor).toBe("7")
})
it("selects comment ids before limiting and exposes the provider body's message id", async () => {
  const result = await call("bot", "comments", "list", "mid.post", "id:mid.c1", "--limit", "1")
  expect(result.code, result.stderr).toBe(0)
  expect(requests.at(-1)?.searchParams.get("comment_ids")).toBe("mid.c1")
  expect(requests.at(-1)?.searchParams.get("count")).toBe("1")
  expect(result.body.items[0].id).toBe("mid.c1")
})
it.each([
  { args: ["bot", "chats", "members", "list", "-100", "is_admin:true"] },
  { args: ["bot", "chats", "members", "list", "-100", "user_id:word"] },
  { args: ["bot", "chats", "members", "list", "-100", "user_id:42", "--cursor", "4"] },
  { args: ["bot", "comments", "list", "mid.post", "id:mid.a,mid.b"] },
  { args: ["bot", "comments", "list", "mid.post", "timestamp>1"] },
  { args: ["bot", "comments", "list", "mid.post", "id:mid.a OR id:mid.b"] },
])("rejects unsupported query shapes before remote requests: $args", async ({ args }) => {
  const result = await call(...args)
  expect(result.code).toBe(2)
  expect(requests).toHaveLength(0)
})
it("a filtered recipient list preserves the actual allowlist state", async () => {
  const list = recipientListFor("querytest")
  list.add({ id: "7", title: "Book club", addedAt: "2026-10-01T00:00:00Z" })
  list.add({ id: "8", title: "Other", addedAt: "2026-10-01T00:00:00Z" })
  const selected = await call("recipients", "list", "id:7")
  expect(selected.code, selected.stderr).toBe(0)
  expect(selected.body.items.map((row: { id: string }) => row.id)).toEqual(["7"])
  expect(list.read()).toHaveLength(2)
  const empty = await call("recipients", "list", "id:99")
  expect(empty.code, empty.stderr).toBe(0)
  expect(empty.body.items).toEqual([])
  expect(empty.stderr).not.toContain("may send nowhere")
  expect(requests).toHaveLength(0)
})
