import { mkdirSync } from "node:fs"
import { createServer } from "node:net"
import { dirname } from "node:path"
import { PassThrough } from "node:stream"
import { captureStreams, type KeyringStore, memoryKeyring, pathsAreOverridden, systemKeyring } from "@wirecat/cli-base"
import { PASTE_QR, plainQr } from "@wirecat/cli-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { fromLine, lineReader, toLine } from "./server/lines.js"
import type { BrowserDoors } from "./session/browser.js"
import { SessionStore } from "./session/store.js"
import { type MockMax, mockMax } from "./testing/mock-max.js"

const LOGIN = { profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "FULL_NAME" }] } } }

/** Answers in turn, the last one repeating — how a poll that is pending and then ready is scripted. */
const inTurn = (...answers: Payload[]) => {
  let at = 0
  return () => answers[Math.min(at++, answers.length - 1)]
}

const qrCode = (overrides: Payload = {}) => ({
  qrLink: "https://qr.example/?token=qr-link-secret",
  trackId: "track-secret",
  pollingInterval: 1,
  expiresAt: Date.now() + 60_000,
  ...overrides,
})

const noBrowser: BrowserDoors = {
  chromiumToken: async () => {
    throw new Error("no browser was expected")
  },
}

/**
 * The login happens on one connection and the token is tried on a second, so there are two scripted
 * MAXes: `login` for obtaining the token, `adopt` for the LOGIN that proves it.
 */
const setUp = (login: MockMax | undefined, adopt: MockMax, extra: Partial<Environment> = {}) => {
  const keyring = memoryKeyring()
  const sockets = [login, adopt].filter((max) => max !== undefined)
  let connections = 0
  const streams = captureStreams()
  const environment: Environment = {
    streams,
    env: { ...process.env, CI: "" },
    tty: true,
    interactive: true,
    columns: 200,
    browser: noBrowser,
    ask: async () => {
      throw new Error("nothing was expected to be asked")
    },
    store: (profile) => new SessionStore({ profile, keyring }),
    connection: () => {
      const max = sockets[connections++]
      if (!max) throw new Error("one connection more than was scripted")
      return new Connection({ createSocket: max.createSocket, timeoutMs: 50 })
    },
    ...extra,
  }
  return {
    streams,
    connections: () => connections,
    stored: () => new SessionStore({ profile: "default", keyring }).readToken(),
    start: (...argv: string[]) => run(["session", "start", ...argv], environment),
  }
}

const adopting = () => mockMax({ answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: LOGIN } })

describe("max session start qr", () => {
  it("draws the code here, says where to scan it, waits for the phone, and stores the token MAX then accepts", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: inTurn({ status: {} }, { status: { loginAvailable: true } }),
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-token" } } },
      },
    })
    const adopt = adopting()
    const { start, stored, streams } = setUp(login, adopt)

    expect(await start("qr")).toBe(0)

    const stderr = streams.stderr.join("\n")
    expect(stderr).toMatch(/[█▀▄]/)
    expect(stderr.indexOf("scan in the MAX app on your phone")).toBeGreaterThan(stderr.lastIndexOf("▀"))
    expect(streams.stdout.join("")).not.toMatch(/[█▀▄]/)
    expect(login.sent.map(({ opcode }) => opcode)).toEqual([6, 288, 289, 289, 291])
    expect(stored()).toBe("qr-token")
  })

  it("draws nothing on a terminal too narrow for the code, opens nothing, and says to widen it, not where to scan", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: inTurn({ status: {} }, { status: { loginAvailable: true } }),
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-token" } } },
      },
    })
    const { start, stored, streams } = setUp(login, adopting(), { columns: 20 })

    expect(await start("qr")).toBe(0)

    const stderr = streams.stderr.join("\n")
    expect(stderr).not.toMatch(/[█▀▄]/)
    expect(stderr).toMatch(/20 columns wide .* widen it/)
    expect(stderr).not.toMatch(/\bscan\b/i)
    expect(stored()).toBe("qr-token")
  })

  it("**without a terminal, prints the code as text to paste and as one JSON line, then stores the token**", async () => {
    const code = qrCode()
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: code,
        [Opcode.GET_QR_STATUS]: inTurn({ status: {} }, { status: { loginAvailable: true } }),
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-token" } } },
      },
    })
    const { start, stored, streams } = setUp(login, adopting(), { interactive: false, tty: false })

    expect(await start("qr", "--json")).toBe(0)

    const stderr = streams.stderr.join("\n")
    expect(stderr).toContain(plainQr(code.qrLink))
    expect(stderr).toContain(PASTE_QR)
    expect(stderr).not.toContain("\x1b")
    const events = streams.stderr.filter((line) => line.startsWith('{"event"')).map((line) => JSON.parse(line))
    expect(events).toEqual([
      {
        event: "qr",
        qr: {
          text: plainQr(code.qrLink),
          expires_at: new Date(code.expiresAt).toISOString(),
          scan: "scan in the MAX app on your phone",
        },
      },
    ])
    expect(stored()).toBe("qr-token")
    expect(JSON.parse(streams.stdout.join(""))).toMatchObject({ item: { stored: true, method: "qr" } })
    for (const secret of ["qr-token", "track-secret", "qr-link-secret"])
      expect([...streams.stdout, ...streams.stderr].join("\n")).not.toContain(secret)
  })

  it("asks for the cloud password when MAX wants one, and sends it", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { passwordChallenge: { trackId: "password-track", hint: "the cat" } },
        [Opcode.AUTH_LOGIN_CHECK_PASSWORD]: { tokenAttrs: { LOGIN: { token: "password-token" } } },
      },
    })
    const asked: string[] = []
    const { start, stored } = setUp(login, adopting(), {
      browser: noBrowser,
      ask: async (prompt, options) => {
        asked.push(`${prompt}${options?.secret ? " (secret)" : ""}`)
        return "hunter2"
      },
    })

    expect(await start("qr")).toBe(0)

    expect(asked).toEqual(["MAX password (hint: the cat):  (secret)"])
    expect(login.sent.at(-1)?.payload).toEqual({ trackId: "password-track", password: "hunter2" })
    expect(stored()).toBe("password-token")
  })

  it("with --answer-stdin and no terminal, asks for the cloud password as a `needs` line and reads it from stdin", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { passwordChallenge: { trackId: "password-track", hint: "the cat" } },
        [Opcode.AUTH_LOGIN_CHECK_PASSWORD]: { tokenAttrs: { LOGIN: { token: "password-token" } } },
      },
    })
    const stdin = Object.assign(new PassThrough(), { isTTY: false })
    stdin.write("not-a-real-password\n")
    const { start, stored, streams } = setUp(login, adopting(), { interactive: false, tty: false, stdin })

    expect(await start("qr", "--json", "--answer-stdin")).toBe(0)

    const events = streams.stderr.filter((line) => line.startsWith('{"event"')).map((line) => JSON.parse(line))
    expect(events.map(({ event }) => event)).toEqual(["qr", "needs"])
    expect(events[1]).toEqual({
      event: "needs",
      field: "password",
      secret: true,
      prompt: "MAX password",
      hint: "the cat",
    })
    expect(login.sent.at(-1)?.payload).toEqual({ trackId: "password-track", password: "not-a-real-password" })
    expect(stored()).toBe("password-token")
    expect([...streams.stdout, ...streams.stderr].join("\n")).not.toContain("not-a-real-password")
  })

  it("without --answer-stdin and no terminal, still refuses to ask for the cloud password", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { passwordChallenge: { trackId: "password-track", hint: "the cat" } },
      },
    })
    const stdin = Object.assign(new PassThrough(), { isTTY: false })
    const { start, stored, streams } = setUp(login, adopting(), { interactive: false, tty: false, stdin })

    expect(await start("qr", "--json")).not.toBe(0)
    expect(streams.stderr.join("\n")).toContain("needs a terminal to ask for the MAX password")
    expect(stored()).toBeUndefined()
  })

  it("asks again after a wrong password, and gives up after three", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { passwordChallenge: { trackId: "password-track", hint: "the cat" } },
      },
      refuse: { [Opcode.AUTH_LOGIN_CHECK_PASSWORD]: "password2fa.wrong" },
    })
    const asked: string[] = []
    const { start, stored, streams } = setUp(login, adopting(), {
      browser: noBrowser,
      ask: async (prompt) => {
        asked.push(prompt)
        return "not-it"
      },
    })

    expect(await start("qr")).toBe(4)

    expect(asked).toEqual([
      "MAX password (hint: the cat): ",
      "wrong password, try again (hint: the cat): ",
      "wrong password, try again (hint: the cat): ",
    ])
    expect(streams.stderr.join("\n")).toContain("the password was wrong 3 times")
    expect(streams.stderr.join("\n")).not.toContain("opcode 115")
    expect(stored()).toBeUndefined()
  })

  it("gives up when the code expires unscanned, and stores nothing", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode({ expiresAt: Date.now() + 5, pollingInterval: 20 }),
        [Opcode.GET_QR_STATUS]: { status: {} },
      },
    })
    const { start, stored, connections } = setUp(login, adopting(), {
      browser: noBrowser,
    })

    expect(await start("qr")).toBe(9)
    expect(stored()).toBeUndefined()
    expect(connections()).toBe(1)
    expect(login.closed).toBe(true)
  })

  it("stores nothing when MAX refuses the token the login produced", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: { status: { loginAvailable: true } },
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "dead-token" } } },
      },
    })
    const adopt = mockMax({ answers: { [Opcode.SESSION_INIT]: {} }, refuse: { [Opcode.LOGIN]: "login.token" } })
    const { start, stored } = setUp(login, adopt, { browser: noBrowser })

    expect(await start("qr")).not.toBe(0)
    expect(stored()).toBeUndefined()
  })
})

describe("max session start qr-chrome and sms", () => {
  it("takes the token the browser logged in with, and still tries it before storing it", async () => {
    const adopt = adopting()
    const { start, stored } = setUp(undefined, adopt, {
      browser: { ...noBrowser, chromiumToken: async () => "chrome-token" },
    })

    expect(await start("qr-chrome")).toBe(0)
    expect(adopt.sent.map(({ opcode }) => opcode)).toEqual([6, 19])
    expect(stored()).toBe("chrome-token")
  })

  it("sends the SMS login to the browser too — over our own socket MAX demands a captcha", async () => {
    let opened = 0
    const { start, stored, streams } = setUp(undefined, adopting(), {
      browser: {
        ...noBrowser,
        chromiumToken: async () => {
          opened++
          return "sms-token"
        },
      },
    })

    expect(await start("sms")).toBe(0)
    expect(opened).toBe(1)
    expect(streams.stderr.join("\n")).toContain("log in by phone number")
    expect(stored()).toBe("sms-token")
  })
})

describe("max session start token", () => {
  it("prints the phone number masked, as `account show` does", async () => {
    const adopt = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: { profile: { contact: { ...LOGIN.profile.contact, phone: 71234567890 } } },
      },
    })
    const { start, streams } = setUp(undefined, adopt)
    process.env.MAX_TOKEN = "a-token"
    try {
      expect(await start("token", "--json")).toBe(0)
    } finally {
      delete process.env.MAX_TOKEN
    }

    expect(JSON.parse(streams.stdout.join("")).item.profile.phone).toBe("***7890")
    expect(streams.stdout.join("")).not.toContain("71234567890")
  })
})

describe("max session start token from MAX_TOKEN", () => {
  it("stores the token it was given, even when the login answers with a fresh one", async () => {
    const adopt = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: { ...LOGIN, token: "the-rotated-one" } },
    })
    const { start, stored } = setUp(undefined, adopt)
    process.env.MAX_TOKEN = "a-token"
    try {
      expect(await start("token")).toBe(0)
    } finally {
      delete process.env.MAX_TOKEN
    }

    expect(stored()).toBe("a-token")
  })
})

describe("max session start without a person at the terminal", () => {
  it.each(["qr-chrome", "sms"])("refuses %s before opening anything", async (method) => {
    const { start, connections } = setUp(undefined, adopting(), { interactive: false })

    expect(await start(method)).toBe(2)
    expect(connections()).toBe(0)
  })

  it("refuses while MAX_TOKEN is set, because it would outrank the new session", async () => {
    const { start, connections } = setUp(undefined, adopting())
    process.env.MAX_TOKEN = "an-exported-token"
    try {
      expect(await start("qr-chrome")).toBe(2)
    } finally {
      delete process.env.MAX_TOKEN
    }
    expect(connections()).toBe(0)
  })

  it("refuses a method it does not know, including the old sms-chrome", async () => {
    const { start } = setUp(undefined, adopting())
    expect(await start("fax")).not.toBe(0)
    expect(await start("sms-chrome")).not.toBe(0)
  })
})

describe("max session end", () => {
  const ending = (
    logout: { answer?: Payload; refuse?: string; loginRefused?: string } = {},
    keyring: KeyringStore = memoryKeyring(),
    env: NodeJS.ProcessEnv = process.env,
  ) => {
    const store = (profile: string) => new SessionStore({ profile, keyring, env })
    const max = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [] },
        [Opcode.LOGOUT]: logout.answer ?? {},
      },
      refuse: {
        [Opcode.LOGOUT]: () => logout.refuse,
        [Opcode.LOGIN]: () => logout.loginRefused,
      },
    })
    const environment: Environment = {
      tty: false,
      store,
      connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    }
    const end = async (...flags: string[]) => {
      const streams = captureStreams()
      const code = await run(["s-end", "session", "end", ...flags, "--json"], { ...environment, streams })
      const out = streams.stdout.join("")
      return { code, json: out === "" ? undefined : JSON.parse(out).item }
    }
    const logouts = () => max.sent.filter(({ opcode }) => opcode === Opcode.LOGOUT)
    return { store, end, logouts, max }
  }

  it("logs the session out on MAX's side, then forgets the token here", async () => {
    const { store, end, logouts } = ending()
    store("s-end").writeToken("a-token")

    expect(await end()).toEqual({ code: 0, json: { profile: "s-end", forgotten: true, revoked_on_server: true } })
    expect(logouts().map(({ payload }) => payload)).toEqual([{}])
    expect(store("s-end").readToken()).toBeUndefined()
  })

  it("keeps the token when MAX refuses the logout, so it can be tried again", async () => {
    const { store, end } = ending({ refuse: "proto.state" })
    store("s-end").writeToken("a-token")

    expect((await end()).code).not.toBe(0)
    expect(store("s-end").readToken()).toBe("a-token")
  })

  it("forgets a token MAX no longer accepts: there is nothing left to log out", async () => {
    const { store, end, logouts } = ending({ loginRefused: "login.token" })
    store("s-end").writeToken("a-token")

    expect((await end()).json).toEqual({ profile: "s-end", forgotten: true, revoked_on_server: true })
    expect(logouts()).toEqual([])
    expect(store("s-end").readToken()).toBeUndefined()
  })

  it("**refuses while a hand-started serve holds the session**: no logout through it or here, the token kept", async () => {
    const { store, logouts } = ending()
    store("s-end").writeToken("a-token")
    const socket = store("s-end").socketPath()
    if (process.platform !== "win32") mkdirSync(dirname(socket), { recursive: true })
    const asked: Record<string, unknown>[] = []
    const serve = createServer((connection) =>
      connection.on(
        "data",
        lineReader((line) => {
          const request = fromLine(line)
          asked.push(request)
          if (request.stop === true) connection.end(toLine({ id: request.id, stopped: false }))
        }),
      ),
    )
    await new Promise<void>((resolve) => serve.listen(socket, resolve))

    try {
      const streams = captureStreams()
      const code = await run(["s-end", "session", "end", "--json"], {
        tty: false,
        store,
        connection: () => {
          throw new Error("session end connected while serve held the session")
        },
        streams,
      })

      expect(code).toBe(2)
      expect(JSON.parse(streams.stderr.join("")).error.message).toContain("`max s-end server stop` first")
      expect(asked).toEqual([{ id: 1, stop: true }])
      expect(logouts()).toEqual([])
      expect(store("s-end").readToken()).toBe("a-token")
    } finally {
      await new Promise((resolve) => serve.close(resolve))
    }
  })

  it("says there was nothing to end, and contacts nobody", async () => {
    const { end, max } = ending()
    expect((await end()).json).toEqual({ profile: "s-end", forgotten: false, revoked_on_server: false })
    expect(max.sent).toEqual([])
  })

  describe("with only HOME moved, against the system keyring (SEC-103)", () => {
    afterEach(() => vi.restoreAllMocks())

    const movedHome = () => {
      const env = { ...process.env }
      for (const kind of ["CONFIG", "STATE", "CACHE"]) delete env[`MAX_${kind}_DIR`]
      expect(pathsAreOverridden({ appName: "max-cli", prefix: "MAX", env })).toBe(false)
      const entries = new Map<string, string>([["max-cli\u0000s-end", "owners-token"]])
      const key = (service: string, account: string) => `${service}\u0000${account}`
      vi.spyOn(systemKeyring, "get").mockImplementation(
        (service, account) => entries.get(key(service, account)) ?? null,
      )
      vi.spyOn(systemKeyring, "set").mockImplementation((service, account, secret) => {
        entries.set(key(service, account), secret)
      })
      const deleted = vi
        .spyOn(systemKeyring, "delete")
        .mockImplementation((service, account) => entries.delete(key(service, account)))
      return { ...ending({}, systemKeyring, env), entries, deleted }
    }

    it("keeps the owner's sign-in: no logout on MAX, nothing removed, and the answer says so", async () => {
      const { end, logouts, entries, deleted } = movedHome()

      expect(await end()).toEqual({
        code: 0,
        json: { profile: "s-end", forgotten: false, revoked_on_server: false, kept: "owners-sign-in" },
      })
      expect(logouts()).toEqual([])
      expect(deleted).not.toHaveBeenCalled()
      expect(entries.get("max-cli\u0000s-end")).toBe("owners-token")
    })

    it("ends a sign-in the run made itself, and removes only its temporary entry", async () => {
      const { store, end, logouts, entries, deleted } = movedHome()
      store("s-end").writeToken("own-token")

      expect((await end()).json).toEqual({ profile: "s-end", forgotten: true, revoked_on_server: true })
      expect(logouts()).toHaveLength(1)
      expect(deleted.mock.calls.map(([service]) => service)).not.toContain("max-cli")
      expect(entries.get("max-cli\u0000s-end")).toBe("owners-token")
      expect([...entries.values()]).toEqual(["owners-token"])
    })
  })
})
