import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { afterEach, describe, expect, it } from "vitest"
import { BotTokenStore } from "./bot/auth.js"
import { maxNotes } from "./doctor.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

// The three directory variables are moved rather than injected because `resolveSettings` reads `process.env` for them,
// and moving them is also what makes each case a machine nobody has logged in on.
const homes: string[] = []

const inAnEmptyHome = async (
  argv: string[],
  {
    token = false,
    loggedIn = false,
    tty = false,
    bots = [] as string[],
    config = undefined as string | undefined,
    openToOthers = false,
  } = {},
) => {
  const home = mkdtempSync(join(tmpdir(), "max-doctor-cmd-"))
  if (config !== undefined) {
    mkdirSync(join(home, "config"), { recursive: true })
    writeFileSync(join(home, "config", "config.json"), config)
    if (openToOthers) {
      chmodSync(join(home, "config", "config.json"), 0o644)
      chmodSync(join(home, "config"), 0o775)
    }
  }
  for (const bot of bots) {
    mkdirSync(join(home, "state", "bots"), { recursive: true })
    writeFileSync(join(home, "state", "bots", `${bot}.json`), JSON.stringify({ chats: [] }))
  }
  const before = { ...process.env }
  homes.push(home)

  process.env.MAX_CONFIG_DIR = join(home, "config")
  process.env.MAX_STATE_DIR = join(home, "state")
  process.env.MAX_CACHE_DIR = join(home, "cache")
  delete process.env.MAX_TOKEN

  const keyring = memoryKeyring()
  const streams = captureStreams()
  try {
    const code = await run(argv, {
      streams,
      tty,
      botStore: (profile) => new BotTokenStore({ profile, keyring }),
      store: (profile) => {
        const store = new SessionStore({ profile, keyring })
        if (token) store.writeToken("a-token")
        if (loggedIn) store.writeState({ deviceId: "a-device", logins: 2 })
        return store
      },
    })
    return { home, code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
  } finally {
    for (const key of ["MAX_CONFIG_DIR", "MAX_STATE_DIR", "MAX_CACHE_DIR", "MAX_TOKEN"]) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  }
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe("max doctor, on cli-core's shared doctor", () => {
  it("**answers MAX's own facts under max, and exits 0 on a machine with no session**", async () => {
    const { code, stdout } = await inAnEmptyHome(["work", "doctor", "--json"])

    expect(code).toBe(0)
    const { item } = JSON.parse(stdout)
    expect(item.max).toMatchObject({
      profile: "work",
      token: { present: false, from: "none" },
      session: { exists: false },
      client: { stale: expect.any(Boolean) },
    })
    expect(item.max.session.state_file).toContain("work.json")
    expect(item.max).not.toHaveProperty("store")
    expect(item.store.path).toBe(process.env.MESSAGING_STORE)
  })

  it("tells a profile whose bot token is gone how to store one, not to run session start", async () => {
    const { stdout, stderr } = await inAnEmptyHome(["shop", "doctor", "--json"], { bots: ["shop"] })

    expect(stderr).toContain("max shop bot auth set")
    expect(stderr).not.toContain("session start")
    expect(stdout).not.toContain("bot auth set")
  })

  it("blames the keyring, not the session, when a profile that has logged in has no token", async () => {
    const { stderr } = await inAnEmptyHome(["work", "doctor", "--json"], { loggedIn: true })

    expect(stderr).toContain("keyring is probably locked or out of reach")
    expect(stderr).not.toContain("session start")
  })

  it("says the token is there and where from, and **never what it is**", async () => {
    const { stdout } = await inAnEmptyHome(["work", "doctor", "--json"], { token: true })

    expect(JSON.parse(stdout).item.max.token).toEqual({ present: true, from: "keyring" })
    expect(stdout).not.toContain("a-token")
  })

  it("**names the keyring entry the environment moved** — the failure with no other symptom", async () => {
    const { stdout, stderr } = await inAnEmptyHome(["work", "doctor", "--json"])

    expect(JSON.parse(stdout).item.max.keyring.moved_by_environment).toBe(true)
    expect(stderr).toContain("MAX_CONFIG_DIR")
  })

  it("**creates nothing** — not the state file it reports on, not the cache", async () => {
    const { home } = await inAnEmptyHome(["work", "doctor"])

    expect(existsSync(join(home, "state", "profiles"))).toBe(false)
    expect(existsSync(join(home, "cache"))).toBe(false)
  })
})

describe("what doctor says about the installation", () => {
  const block = (install: object, native = { keyring: "ok", sqlite: "ok" }) => ({
    profile: "work",
    token: { present: true },
    keyring: { moved_by_environment: false },
    session: { logins: 1, viewer_id: true, login_paused_until: null },
    bot: { token: { present: false }, registry: { exists: false } },
    client: { stale: false, app_version: "26.11.11", age_days: 1 },
    install: { installer: "npm", bin_dir: null, on_path: null, is_max_cli: null, fix: [], ...install },
    native,
  })

  it("says nothing when max is on PATH and everything loads", () => {
    expect(maxNotes(block({ bin_dir: "/b", on_path: "/b/max", is_max_cli: true }))).toEqual([])
  })

  it("prints both PowerShell lines when the command directory is not on PATH", () => {
    const [said] = maxNotes(block({ bin_dir: "C:\\npm", fix: ["$env:Path = …", "[Environment]::…"] }))

    expect(said).toContain("C:\\npm, which is not on PATH")
    expect(said).toContain("  $env:Path = …\n  [Environment]::…")
    expect(said).toContain("then open a new terminal")
  })

  it("names another program called max, and what fails to load", () => {
    expect(
      maxNotes(block({ on_path: "/opt/max", is_max_cli: false }, { keyring: "no build for x", sqlite: "ok" })),
    ).toEqual([expect.stringContaining("/opt/max, another program"), expect.stringContaining("no build for x")])
  })

  it("under npx with no max on PATH, says how to install one", () => {
    expect(maxNotes(block({ installer: "npx" }))).toEqual([expect.stringContaining("npm install -g @wirecat/max-cli")])
  })

  it("warns that MAX may refuse a web client version read long ago", () => {
    const stale = { ...block({}), client: { stale: true, app_version: "26.1.1", age_days: 90 } }

    expect(maxNotes(stale)).toEqual([expect.stringContaining("(26.1.1) was read 90 days ago")])
  })
})
