import { existsSync, mkdirSync, mkdtempSync, statSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
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
  it("draws the code here, waits for the phone, and stores the token MAX then accepts", async () => {
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

    expect(await start("qr", "--quiet")).toBe(0)

    expect(streams.stderr.join("\n")).toMatch(/[█▀▄]/)
    expect(streams.stdout.join("")).not.toMatch(/[█▀▄]/)
    expect(login.sent.map(({ opcode }) => opcode)).toEqual([6, 288, 289, 289, 291])
    expect(stored()).toBe("qr-token")
  })

  it("draws nothing on a terminal too narrow for the code, opens nothing, and points at --qr-file", async () => {
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: inTurn({ status: {} }, { status: { loginAvailable: true } }),
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-token" } } },
      },
    })
    const { start, stored, streams } = setUp(login, adopting(), { columns: 20 })

    expect(await start("qr", "--quiet")).toBe(0)

    const stderr = streams.stderr.join("\n")
    expect(stderr).not.toMatch(/[█▀▄]/)
    expect(stderr).toMatch(/20 columns wide .* --qr-file <png>/)
    expect(stored()).toBe("qr-token")
  })

  it("**--qr-file writes the code as a PNG with mode 600, with no terminal, and removes it after**", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "max-qr-")), "login.png")
    let mode: number | undefined
    const login = mockMax({
      answers: {
        [Opcode.SESSION_INIT]: {},
        [Opcode.GET_QR]: qrCode(),
        [Opcode.GET_QR_STATUS]: () => {
          mode = statSync(path).mode & 0o777
          return { status: { loginAvailable: true } }
        },
        [Opcode.LOGIN_BY_QR]: { tokenAttrs: { LOGIN: { token: "qr-token" } } },
      },
    })
    const { start, stored, streams } = setUp(login, adopting(), { interactive: false, tty: false })

    expect(await start("qr", "--qr-file", path, "--json")).toBe(0)

    if (process.platform !== "win32") expect(mode).toBe(0o600)
    expect(existsSync(path)).toBe(false)
    expect(stored()).toBe("qr-token")
    expect(streams.stderr.join("\n")).not.toMatch(/[█▀▄]/)
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
  it.each(["qr", "qr-chrome", "sms"])("refuses %s before opening anything", async (method) => {
    const { start, connections } = setUp(undefined, adopting(), { interactive: false })

    expect(await start(method)).toBe(2)
    expect(connections()).toBe(0)
  })

  it("refuses qr with the refusal tg and wa give, pointing at --qr-file", async () => {
    const { start, streams } = setUp(undefined, adopting(), { interactive: false })

    expect(await start("qr", "--json")).toBe(2)
    expect(JSON.parse(streams.stderr.at(-1) ?? "").error.message).toBe(
      "max default session start qr shows a QR code to scan — run it in a terminal, or pass --qr-file <png>",
    )
  })

  it("refuses --qr-file for anything but a QR login", async () => {
    const { start, connections } = setUp(undefined, adopting())

    expect(await start("qr-chrome", "--qr-file", "x.png")).toBe(2)
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
  const ending = (logout: { answer?: Payload; refuse?: string; loginRefused?: string } = {}) => {
    const keyring = memoryKeyring()
    const store = (profile: string) => new SessionStore({ profile, keyring })
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
})
