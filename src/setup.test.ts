import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore, withLoginRefused } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const LOGIN = {
  profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
  chats: Array.from({ length: 7 }, (_, n) => ({
    id: 111 + n,
    title: `Chat ${n}`,
    type: "CHAT",
    lastEventTime: 1789776000000,
  })),
}

const harness = ({ token = true, previous = false } = {}) => {
  const max = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: LOGIN } })
  const keyring = memoryKeyring()
  const store = new SessionStore({ profile: "setup-test", keyring })
  store.writeState({ deviceId: "synthetic-setup-device", logins: 0 })
  if (token) store.writeToken("setup-token")
  if (previous) store.writeState({ ...store.readState(), viewerId: "10000001", logins: 1 })
  const streams = captureStreams()
  const environment: Environment = {
    store: () => store,
    streams,
    tty: false,
    interactive: false,
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  return {
    max,
    store,
    environment,
    streams,
    setup: (...args: string[]) => run(["setup-test", "setup", ...args], environment),
  }
}

afterEach(() => vi.unstubAllEnvs())

describe("MAX guided setup", () => {
  it("reuses credentials, checks five chats and returns one result without fetching history", async () => {
    const h = harness()
    expect(await h.setup("--json")).toBe(0)
    const output = h.streams.stdout.join("\n")
    expect(JSON.parse(output)).toMatchObject({
      profile: "setup-test",
      session: { reused: true },
      chats: { checked: 5, hasMore: true },
      agent: { name: "none", written: [] },
      next: { instructions: "max setup-test skill show", chats: "max setup-test chats list --limit 5" },
    })
    expect(output).not.toContain("setup-token")
    expect(h.max.sent.map((x) => x.opcode)).not.toContain(Opcode.CHAT_HISTORY)
    expect(h.max.sent.map((x) => x.opcode)).not.toContain(Opcode.GET_QR)
    expect(h.max.unexpected).toEqual([])
    expect(h.max.closed).toBe(true)
    expect(h.streams.stderr.join("\n")).toContain("5 minutes")
    expect(h.streams.stderr.join("\n")).toContain("history is a separate step")
  })

  it("fresh token import validates then stores the token, without printing it", async () => {
    const h = harness({ token: false })
    h.environment.ask = async () => "new-setup-token"
    expect(await h.setup("--method", "token", "--agent", "none", "--json")).toBe(0)
    expect(h.store.readToken()).toBe("new-setup-token")
    expect(JSON.parse(h.streams.stdout.join("\n"))).toMatchObject({ session: { reused: false } })
    expect(h.streams.stdout.join("\n") + h.streams.stderr.join("\n")).not.toContain("new-setup-token")
  })

  it.each(["qr-chrome", "sms"])("uses the existing browser login for %s", async (method) => {
    const h = harness({ token: false })
    h.environment.interactive = true
    const browser = vi.fn(async () => "browser-setup-token")
    h.environment.browser = { chromiumToken: browser, open: async () => {} }
    expect(await h.setup("--method", method, "--agent", "none", "--json")).toBe(0)
    expect(browser).toHaveBeenCalledOnce()
    expect(h.store.readToken()).toBe("browser-setup-token")
  })

  it("fresh QR uses the existing QR protocol before adopting the token", async () => {
    const h = harness({ token: false })
    const qr = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: {
          qrLink: "https://qr.example/?token=synthetic",
          trackId: "synthetic",
          pollingInterval: 1,
          expiresAt: Date.now() + 60_000,
        },
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-setup-token" } } },
      },
    })
    let count = 0
    h.environment.connection = () =>
      new Connection({ createSocket: (count++ === 0 ? qr : h.max).createSocket, timeoutMs: 50 })
    h.environment.interactive = true
    h.environment.columns = 200
    expect(await h.setup("--agent", "none", "--json")).toBe(0)
    expect(h.store.readToken()).toBe("qr-setup-token")
    expect(qr.unexpected).toEqual([])
    expect(h.max.unexpected).toEqual([])
  })

  it("does not try a fresh login when a previously used keyring is unreachable", async () => {
    const h = harness({ token: false, previous: true })
    h.environment.ask = vi.fn()
    expect(await h.setup("--json")).toBe(4)
    expect(h.streams.stderr.join("\n")).toContain("XDG_RUNTIME_DIR")
    expect(h.environment.ask).not.toHaveBeenCalled()
    expect(h.max.sent).toEqual([])
  })

  it("keeps a paused profile from logging in", async () => {
    const h = harness({ previous: true })
    h.store.writeState(withLoginRefused(h.store.readState()))
    expect(await h.setup("--json")).toBe(8)
    expect(h.max.sent).toEqual([])
  })

  it("keeps bot setup separate without opening a personal connection", async () => {
    const h = harness()
    vi.spyOn(h.store, "isBot").mockReturnValue(true)
    expect(await h.setup("--json")).toBe(2)
    expect(h.streams.stderr.join("\n")).toContain("bot auth set")
    expect(h.max.sent).toEqual([])
  })

  it("refuses an invalid interactive agent selection without installing files", async () => {
    const home = mkdtempSync(join(tmpdir(), "max-setup-invalid-agent-"))
    vi.stubEnv("HOME", home)
    vi.stubEnv("USERPROFILE", home)
    const h = harness()
    h.environment.interactive = true
    h.environment.tty = true
    h.environment.ask = async () => "invalid"
    expect(await h.setup()).toBe(2)
    expect(existsSync(join(home, ".agents"))).toBe(false)
    expect(existsSync(join(home, ".claude"))).toBe(false)
  })

  it("closes an unanswered verification connection at the deadline", async () => {
    const h = harness()
    const silent = mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: () => undefined } })
    h.environment.connection = () => new Connection({ createSocket: silent.createSocket, timeoutMs: 5000 })
    expect(await h.setup("--timeout", "30ms", "--json")).toBe(9)
    expect(silent.closed).toBe(true)
    expect(h.streams.stdout).toEqual([])
  })

  it("refuses a first QR login without a terminal and does not contact MAX", async () => {
    const h = harness({ token: false })
    expect(await h.setup("--json")).toBe(2)
    expect(h.streams.stderr.join("\n")).toContain("local terminal")
    expect(h.max.sent).toEqual([])
  })

  it.each([["--offline"], ["--agent", "invalid"], ["--method", "invalid"]].map((args) => [args]))(
    "refuses invalid setup %j before login",
    async (args) => {
      const h = harness()
      expect(await h.setup(...args, "--json")).not.toBe(0)
      expect(h.max.sent).toEqual([])
    },
  )

  it.each(["codex", "cursor", "claude", "gemini", "all"])("installs the shipped skill for %s", async (agent) => {
    const home = mkdtempSync(join(tmpdir(), "max-setup-agent-"))
    vi.stubEnv("HOME", home)
    vi.stubEnv("USERPROFILE", home)
    const h = harness()
    expect(await h.setup("--agent", agent, "--json")).toBe(0)
    const { agent: result } = JSON.parse(h.streams.stdout.join("\n"))
    expect(result.name).toBe(agent)
    expect(result.written).toHaveLength(agent === "all" ? 2 : 1)
    for (const path of result.written) {
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, "utf8")).toContain("name: max-cli")
    }
  })

  it("asks a person for an agent and prints useful next commands", async () => {
    const h = harness()
    h.environment.tty = true
    h.environment.interactive = true
    h.environment.ask = async () => "none"
    expect(await h.setup()).toBe(0)
    expect(h.streams.stdout.join("\n")).toContain("For your agent: max setup-test skill show")
    expect(h.streams.stdout.join("\n")).toContain("Install later: max setup-test skill install")
  })

  it("keeps an npm exec runner in next commands", async () => {
    const h = harness()
    h.environment.update = { scriptPath: "/tmp/.npm/_npx/abc/node_modules/@leemour/max-cli/dist/bin/max.js" }
    expect(await h.setup("--json")).toBe(0)
    expect(JSON.parse(h.streams.stdout.join("\n")).next.instructions).toContain(
      "exec --yes --package=@leemour/max-cli -- max setup-test skill show",
    )
  })

  it("deadline cancels terminal input before a token or skill is stored", async () => {
    const h = harness({ token: false })
    h.environment.stdin = new PassThrough()
    expect(await h.setup("--method", "token", "--timeout", "20ms", "--json")).toBe(9)
    expect(h.streams.stderr.join("\n")).toMatch(/"code"\s*:\s*"timeout"/)
    expect(h.store.readToken()).toBeUndefined()
    expect(h.streams.stdout).toEqual([])
    expect(h.max.sent).toEqual([])
  })

  it.each(
    [["--help"], ["setup", "--help"], ["session", "start", "--help"], ["skill", "--help"], ["skill", "show"]].map(
      (argv) => [argv],
    ),
  )("makes instructions available without credentials: %j", async (argv) => {
    const h = harness({ token: false })
    expect(await run(argv, h.environment)).toBe(0)
    expect(h.streams.stdout.join("\n")).toContain("max setup")
    expect(h.max.sent).toEqual([])
  })
})
