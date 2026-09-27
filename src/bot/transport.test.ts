import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { CliError } from "@leemour/cli-core"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { botOperations } from "./client.js"
import { BotTransport, plainJson } from "./transport.js"

type Handler = (request: IncomingMessage & { body: string }, response: ServerResponse) => void

let server: Server
let baseUrl: string
let handler: Handler
const seen: { method?: string; url?: string; authorization?: string; body: string }[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body })
      handler(Object.assign(request, { body }), response)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
afterEach(() => {
  seen.length = 0
})

const TOKEN = "secret-bot-token-for-tests"
const operation = (id: string) => {
  const found = botOperations.find((candidate) => candidate.id === id)
  if (!found) throw new Error(id)
  return found
}
const transport = (extra = {}) =>
  new BotTransport({
    token: TOKEN,
    baseUrl,
    fetch,
    retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1, maxRetryAfterMs: 5_000 },
    sleep: async () => {},
    ...extra,
  })
const answer =
  (status: number, body: string, headers: Record<string, string> = {}): Handler =>
  (_, response) => {
    response.writeHead(status, { "content-type": "application/json", ...headers })
    response.end(body)
  }
const failure = async (promise: Promise<unknown>): Promise<CliError> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof CliError) return error
    throw error
  }
  throw new Error("expected a failure")
}

describe("BotTransport", () => {
  it("sends the token as the bare Authorization header — no Bearer, never in the URL", async () => {
    handler = answer(200, `{"user_id": 1}`)
    await transport().call(operation("getMyInfo"))
    expect(seen[0]).toMatchObject({ method: "GET", url: "/me", authorization: TOKEN })
    expect(seen[0]?.url).not.toContain(TOKEN)
  })

  it("keeps a 64-bit id exact on the way in and on the way out", async () => {
    handler = answer(200, `{"chat_id": 9007199254740993, "small": 42}`)
    const result = await transport().call(operation("getChat"), { path: { chatId: "-9007199254740993" } })
    expect(seen[0]?.url).toBe("/chats/-9007199254740993")
    expect(plainJson(result)).toEqual({ chat_id: "9007199254740993", small: 42 })
  })

  it("sends a body as the text it was given, digits and all", async () => {
    handler = answer(200, `{"success": true}`)
    const body = `{"user_ids": [9007199254740993]}`
    await transport().call(operation("addMembers"), { path: { chatId: "1" }, body })
    expect(seen[0]).toMatchObject({ method: "POST", body })
  })

  it("repeats a read on 429, honouring Retry-After", async () => {
    let calls = 0
    handler = (request, response) => {
      calls++
      if (calls === 1) return answer(429, `{"code": "too.many.requests"}`, { "retry-after": "1" })(request, response)
      answer(200, `{"ok": 1}`)(request, response)
    }
    const waits: number[] = []
    await transport({ sleep: async (ms: number) => void waits.push(ms) }).call(operation("getMyInfo"))
    expect(calls).toBe(2)
    expect(waits).toEqual([1000])
  })

  it("never repeats a write, even on 503", async () => {
    handler = answer(503, `{"code": "service.unavailable", "message": "later"}`)
    const error = await failure(transport().call(operation("sendMessage"), { body: "{}" }))
    expect(seen).toHaveLength(1)
    expect(error).toMatchObject({
      code: "provider_unavailable",
      details: { status: 503, maxCode: "service.unavailable" },
    })
  })

  it("calls a write that got no answer an unknown outcome, not a failure to repeat", async () => {
    handler = () => {}
    const error = await failure(transport({ timeoutMs: 50 }).call(operation("sendMessage"), { body: "{}" }))
    expect(error.code).toBe("outcome_unknown")
    expect(seen).toHaveLength(1)
  })

  it("reports a read that timed out as a timeout, after the retries", async () => {
    handler = () => {}
    const error = await failure(transport({ timeoutMs: 30 }).call(operation("getMyInfo")))
    expect(error.code).toBe("timeout")
    expect(seen).toHaveLength(3)
  })

  it("names MAX's own error code and keeps the token out of the message", async () => {
    handler = answer(401, `{"code": "verify.token", "message": "Invalid access_token ${TOKEN}"}`)
    const error = await failure(transport().call(operation("getMyInfo")))
    expect(error).toMatchObject({ code: "authentication_error", details: { maxCode: "verify.token", status: 401 } })
    expect(error.message).not.toContain(TOKEN)
    expect(JSON.stringify(error.details)).not.toContain(TOKEN)
  })

  it("survives an error page that is not JSON, and a success that is not JSON", async () => {
    handler = (_, response) => {
      response.writeHead(502, { "content-type": "text/html" })
      response.end("<html>bad gateway</html>")
    }
    expect(
      (
        await failure(
          transport({ retry: { retries: 0, baseDelayMs: 1, maxDelayMs: 1, maxRetryAfterMs: 1 } }).call(
            operation("getMyInfo"),
          ),
        )
      ).code,
    ).toBe("provider_unavailable")
    handler = answer(200, "<retval>1</retval>")
    expect((await failure(transport().call(operation("getMyInfo")))).code).toBe("invalid_response")
  })

  it("stops when the caller cancels", async () => {
    handler = () => {}
    const controller = new AbortController()
    const pending = transport({ signal: controller.signal }).call(operation("getMyInfo"))
    controller.abort()
    expect((await failure(pending)).code).toBe("cancelled")
  })
})
