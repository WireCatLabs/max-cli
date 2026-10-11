import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { CliError, captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AttachmentLink } from "./domain/models.js"
import { fetchBytes, httpOnly, type Reach, streamBytes, watchdog } from "./download.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { mockMax, pagedHistory } from "./testing/mock-max.js"

let server: Server
let origin: string
let limitedHits = 0
let stalledOpened = 0
let stalledClosed = 0
let stalledCompletion: Promise<void> = Promise.resolve()

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/stalled") {
      stalledOpened++
      stalledCompletion = new Promise((resolve) => {
        response.once("close", () => {
          stalledClosed++
          resolve()
        })
      })
      response.writeHead(200, { "content-type": "application/octet-stream" })
      response.write("partial bytes")
      return
    }
    if (request.url?.startsWith("/webp"))
      return response.writeHead(200, { "content-type": "image/webp" }).end("webp bytes")
    if (request.url === "/truncated")
      return response.writeHead(200, { "content-length": "1000", connection: "close" }).end("short body")
    if (request.url === "/limited") {
      limitedHits++
      return response.writeHead(429, { "retry-after": "2" }).end()
    }
    if (request.url === "/too-large-request") return response.writeHead(413).end()
    if (request.url === "/missing") return response.writeHead(404).end()
    if (request.url === "/moved") return response.writeHead(302, { location: "/elsewhere" }).end()
    if (request.url === "/large-file") {
      response.writeHead(200, { "content-length": String(33 * 1024 * 1024) })
      response.end(Buffer.alloc(33 * 1024 * 1024, 1))
      return
    }
    if (request.url === "/too-large-file")
      return response.writeHead(200, { "content-length": String(5 * 1024 ** 3) }).end()
    if (request.url === "/huge") return response.writeHead(200, { "content-length": String(64 * 1024 * 1024) }).end()
    if (request.url === "/endless") {
      response.writeHead(200)
      const chunk = Buffer.alloc(1024 * 1024)
      const more = () => {
        while (response.write(chunk)) if (response.writableLength > 64 * 1024 * 1024) return
        response.once("drain", more)
      }
      return more()
    }
    response.writeHead(200, { "content-type": "application/octet-stream" }).end("file bytes")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** The test injects its own destination policy where a scenario needs one. */
const anywhere: Reach = async () => {}

const download = async (
  directory: string,
  {
    name = "report.pdf",
    path = "/file",
    reach = anywhere,
    args,
    photo = false,
    twoFiles = false,
  }: { name?: string; path?: string; reach?: Reach; args?: string[]; photo?: boolean; twoFiles?: boolean } = {},
) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [{ id: 111, title: "First", type: "CHAT" }] },
      [Opcode.CHAT_HISTORY]: pagedHistory([
        {
          id: 116762160362694583n,
          time: Number(116762160362694583n >> 16n),
          sender: 10000001,
          text: "",
          attaches: photo
            ? [{ _type: "PHOTO", photoId: 5, photoToken: "synthetic-photo-token", baseUrl: `${origin}/webp` }]
            : [
                { _type: "FILE", fileId: 42, name, size: 10 },
                ...(twoFiles ? [{ _type: "FILE", fileId: 43, name: "later.pdf", size: 10 }] : []),
                { _type: "CALL" },
              ],
        },
      ]),
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.FILE_DOWNLOAD]: { unsafe: false, url: `${origin}${path}` },
    },
  })
  const keyring = memoryKeyring()
  const streams = captureStreams()
  const code = await run(
    args ?? ["messages", "download", "111", "116762160362694583", "--output", directory, "--json"],
    {
      streams,
      tty: false,
      reach,
      store: (profile: string) => {
        const store = new SessionStore({ profile, keyring })
        store.writeToken("a-token")
        return store
      },
      connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    },
  )
  return { code, max, stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
}

describe("max messages download", () => {
  it("asks MAX for the file's link and saves it under the file's own name", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const { code, max, stdout, stderr } = await download(directory)

    expect(code).toBe(0)
    expect(max.unexpected).toEqual([])
    expect(String(max.sent.find((call) => call.opcode === Opcode.FILE_DOWNLOAD)?.payload.fileId)).toBe("42")
    expect(JSON.parse(stdout)).toMatchObject({
      items: [{ kind: "file", path: join(directory, "report.pdf"), bytes: 10 }],
      complete: false,
      batch: { failures: [{ id: "116762160362694583", stage: "record_downloads", error: { code: "not_found" } }] },
    })
    expect(stderr).toContain("not a file, not downloaded: call")
    expect(await readFile(join(directory, "report.pdf"), "utf8")).toBe("file bytes")
  })

  it("names an unnamed WebP photo from its HTTP response MIME", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const result = await download(directory, { photo: true })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).items).toEqual([
      { kind: "photo", path: join(directory, "116762160362694583-1.webp"), bytes: 10 },
    ])
    expect(await readdir(directory)).toEqual(["116762160362694583-1.webp"])
  })

  it("the command timeout closes its stalled HTTP stream and leaves no partial file", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const beforeOpened = stalledOpened
    const beforeClosed = stalledClosed
    const operation = download(directory, {
      path: "/stalled",
      args: [
        "messages",
        "download",
        "111",
        "116762160362694583",
        "--output-dir",
        directory,
        "--timeout",
        "1s",
        "--json",
      ],
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    let closedAtDeadline = false
    const result = await Promise.race([
      operation,
      new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        timer = setTimeout(() => resolve({ code: 99, stdout: "", stderr: '{"error":{"code":"probe_timeout"}}' }), 1500)
      }),
    ])
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    try {
      closedAtDeadline = await Promise.race([
        stalledCompletion.then(() => stalledClosed > beforeClosed),
        new Promise<boolean>((resolve) => {
          closeTimer = setTimeout(() => resolve(false), 500)
        }),
      ])
    } finally {
      clearTimeout(timer)
      clearTimeout(closeTimer)
      server.closeAllConnections()
      await operation
    }
    expect(stalledOpened).toBeGreaterThan(beforeOpened)
    expect(result.stderr).toMatch(/"code"\s*:\s*"timeout"/)
    expect(closedAtDeadline).toBe(true)
    expect(result.stdout).toBe("")
    await expect.poll(() => readdir(directory), { timeout: 500 }).toEqual([])
  })

  it("supports the common output-dir flag and creates its directory", async () => {
    const directory = join(await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-")), "new")
    const result = await download(directory, {
      args: ["messages", "download", "111", "116762160362694583", "--output-dir", directory, "--json"],
    })
    expect(result.code).toBe(0)
    expect(await readFile(join(directory, "report.pdf"), "utf8")).toBe("file bytes")
  })

  it("refuses conflicting directory flags before connecting", async () => {
    const result = await download("unused", {
      args: ["messages", "download", "111", "42", "--output", "one", "--output-dir", "two", "--json"],
    })
    expect(result.code).toBe(2)
    expect(result.max.sent).toEqual([])
    expect(result.stderr).toContain("must name the same directory")
  })

  it("downloads and resumes a whole chat using MAX time keys", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const args = ["messages", "download", "111", "--all", "--output-dir", directory, "--pause", "1ms", "--json"]
    const first = await download(directory, { args })
    expect(first.code).toBe(0)
    expect(JSON.parse(first.stdout)).toMatchObject({ saved: 1, complete: true })
    expect(
      first.max.sent
        .filter(({ opcode }) => opcode === Opcode.CHAT_HISTORY)
        .every(({ payload }) => Number(payload.backward) <= 30),
    ).toBe(true)
    const second = await download(directory, { args })
    expect(second.code).toBe(0)
    expect(second.max.sent.filter(({ opcode }) => opcode === Opcode.FILE_DOWNLOAD)).toEqual([])
    expect(JSON.parse(second.stdout)).toMatchObject({ saved: 0, complete: true })
    expect(await readFile(join(directory, "report.pdf"), "utf8")).toBe("file bytes")
  })

  it("streams a file larger than the voice budget through the consumer", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const result = await download(directory, { path: "/large-file" })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).items[0].bytes).toBe(33 * 1024 * 1024)
  })

  it("**never overwrites a file that is already there**, and leaves no partial file behind", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    await writeFile(join(directory, "report.pdf"), "mine")

    const { code, stdout } = await download(directory)

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      items: [],
      complete: false,
      batch: {
        failures: [
          {
            stage: "download",
            error: {
              code: "validation_error",
              message: expect.stringContaining("already exists"),
              actions: expect.any(Array),
            },
          },
        ],
      },
    })
    expect(await readFile(join(directory, "report.pdf"), "utf8")).toBe("mine")
    expect(await readdir(directory)).toEqual(["report.pdf"])
  })

  it("keeps a name MAX sends inside the output directory", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const { code } = await download(directory, { name: "./../escape.sh" })

    expect(code).toBe(0)
    expect(await readdir(directory)).toEqual(["escape.sh"])
  })

  it("fails when the link does not answer, and saves nothing", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const { code, stdout } = await download(directory, { path: "/missing" })

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      items: [],
      complete: false,
      batch: {
        failures: [
          { stage: "download", error: { message: expect.stringContaining("HTTP 404"), actions: expect.any(Array) } },
        ],
      },
    })
    expect(await readdir(directory)).toEqual([])
  })

  it("reports an HTTP rate limit and its wait, stopping later file requests", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const before = limitedHits
    const result = await download(directory, { path: "/limited", twoFiles: true })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      items: [],
      complete: false,
      batch: {
        stopReason: "rate_limited",
        failures: [
          {
            stage: "download",
            error: {
              code: "rate_limited",
              status: 429,
              retryAfterMs: 2000,
              actions: [{ type: "wait", afterMs: 2000 }, { type: "retry" }],
            },
          },
        ],
      },
    })
    expect(limitedHits - before).toBe(1)
    expect(await readdir(directory)).toEqual([])
  })

  it("reports an HTTP size limit with provider guidance rather than a local setting", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const result = await download(directory, { path: "/too-large-request" })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).batch.failures[0]).toMatchObject({
      stage: "download",
      error: {
        status: 413,
        actions: [{ type: "check", message: expect.stringContaining("provider limits") }, { type: "skip" }],
      },
    })
    expect(await readdir(directory)).toEqual([])
  })

  it("downloads an HTTP attachment on a private network using the default transport", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    let asked = 0
    server.once("request", () => {
      asked += 1
    })
    const { code } = await download(directory, { reach: httpOnly })

    expect(code).toBe(0)
    expect(asked).toBe(1)
    expect(await readFile(join(directory, "report.pdf"), "utf8")).toBe("file bytes")
  })

  it("checks where a redirect goes before following it", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const checked: string[] = []
    const reach: Reach = async (url) => {
      checked.push(url.pathname)
      if (url.pathname === "/elsewhere") throw new CliError("validation_error", "not there")
    }
    const { code, stdout } = await download(directory, { path: "/moved", reach })

    expect(code).toBe(0)
    expect(checked).toEqual(["/moved", "/elsewhere"])
    expect(JSON.parse(stdout)).toMatchObject({
      items: [],
      complete: false,
      batch: { failures: [{ stage: "download", error: { code: "validation_error", message: "not there" } }] },
    })
  })

  it("strips control and direction characters from a name MAX sends", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const { code } = await download(directory, { name: "invoice\u202efdp.exe\u001b[31m" })

    expect(code).toBe(0)
    expect(await readdir(directory)).toEqual(["invoicefdp.exe[31m"])
  })
})

describe("fetchBytes, for a voice message", () => {
  const voice = (path: string): AttachmentLink => ({ kind: "audio", url: `${origin}${path}` })

  it("refuses a body its length says is too large, without reading it", async () => {
    await expect(fetchBytes(voice("/huge"), anywhere)).rejects.toMatchObject({ code: "validation_error" })
  })

  it("stops reading a body that runs past the limit without saying its length", async () => {
    await expect(fetchBytes(voice("/endless"), anywhere)).rejects.toThrow(/larger than 32 MiB/)
  })
})

describe("download stall watchdog", () => {
  it("resets on progress, aborts after silence and disarms on completion", () => {
    vi.useFakeTimers()
    try {
      const stalled = watchdog(100)
      vi.advanceTimersByTime(90)
      stalled.poke()
      vi.advanceTimersByTime(90)
      expect(stalled.signal.aborted).toBe(false)
      vi.advanceTimersByTime(10)
      expect(stalled.signal.aborted).toBe(true)
      stalled.stop()
      const completed = watchdog(100)
      completed.stop()
      vi.advanceTimersByTime(100)
      expect(completed.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("streamBytes", () => {
  it("rejects a disconnected HTTP body and leaves no finished or partial file", async () => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "download-"))
    const result = await download(directory, { path: "/truncated" })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      items: [],
      complete: false,
      batch: { failed: expect.any(Number), failures: [{ stage: "download", error: { actions: expect.any(Array) } }] },
    })
    expect(await readdir(directory)).toEqual([])
  })

  it("enforces a streaming byte budget when the server declares no length", async () => {
    const bytes = streamBytes({ kind: "file", url: `${origin}/endless` }, anywhere, 8)
    await expect(bytes.next()).rejects.toThrow(/larger than/)
  })

  it("retains the general attachment size cap", async () => {
    const bytes = streamBytes({ kind: "file", url: `${origin}/too-large-file` }, anywhere)
    await expect(bytes.next()).rejects.toThrow(/larger than 4096 MiB/)
  })

  it("closes an interrupted HTTP body when its consumer stops early", async () => {
    const bytes = streamBytes({ kind: "file", url: `${origin}/endless` }, anywhere)
    expect((await bytes.next()).value?.byteLength).toBeGreaterThan(0)
    await expect(bytes.return(undefined)).resolves.toMatchObject({ done: true })
  })
})

describe("HTTP attachment links", () => {
  it.each([
    "http://127.0.0.1/",
    "https://[::1]/",
    "https://10.1.2.3/",
    "https://100.64.0.1/",
    "https://198.18.0.1/",
    "https://synthetic.invalid/",
  ])("accepts %s without requiring local DNS or public addresses", async (url) => {
    await expect(httpOnly(new URL(url))).resolves.toBeUndefined()
  })
  it.each(["file:///synthetic", "data:text/plain,synthetic"])("refuses non-HTTP transport %s", async (url) => {
    await expect(httpOnly(new URL(url))).rejects.toThrow(/http or https/)
  })
})
