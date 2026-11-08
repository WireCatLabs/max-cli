import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { captureStreams, type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import { holdLock, lockPath } from "@wirecat/cli-core/background"
import { describe, expect, it, vi } from "vitest"
import { MAX_APP } from "../app.js"
import { run } from "../program.js"
import { MAX_REMOVAL } from "./account-removal.js"

const max = vi.hoisted(() => ({ loggedOut: 0, failWith: undefined as Error | undefined }))

vi.mock("../client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client.js")>()),
  MaxClient: class {
    async logout() {
      if (max.failWith) throw max.failWith
      max.loggedOut += 1
    }
    async close() {}
  },
}))

const SERVICE = MAX_APP.appName

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "max-account-remove-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MAX_CONFIG_DIR: join(root, "config"),
    MAX_STATE_DIR: join(root, "state"),
    MAX_CACHE_DIR: join(root, "cache"),
    MESSAGING_STORE: join(root, "m.db"),
  }
  mkdirSync(join(root, "config"), { recursive: true })
  writeFileSync(join(root, "config", "config.json"), JSON.stringify({ profiles: { personal: {}, work: {} } }))
  const profiles = join(root, "state", "profiles")
  mkdirSync(profiles, { recursive: true })
  for (const profile of ["personal", "work"]) {
    for (const suffix of [".json", ".sock.refused", ".serve.log"])
      writeFileSync(join(profiles, `${profile}${suffix}`), "")
  }
  const keyring = memoryKeyring({
    [`${SERVICE}:personal`]: "token-personal",
    [`${SERVICE}:work`]: "token-work",
    [`${SERVICE}:bot:personal`]: "bot-token",
  })
  return { root, env, keyring, profiles }
}

const maxCli = async (argv: string[], { env, keyring }: { env: NodeJS.ProcessEnv; keyring: KeyringStore }) => {
  const streams = captureStreams()
  const code = await run(argv, { streams, tty: false, env, keyring })
  const out = streams.stdout.join("")
  return { code, item: out ? JSON.parse(out).item : undefined }
}

const held = (keyring: KeyringStore, account: string) => keyring.get(SERVICE, account) !== null

describe("account remove", () => {
  it("**logs out on MAX and forgets only this profile** with --keep-data", async () => {
    const here = setup()
    max.loggedOut = 0

    const { code, item } = await maxCli(["personal", "account", "remove", "--keep-data", "--yes", "--json"], here)

    expect(code).toBe(0)
    expect(item.revoked).toBe(true)
    expect(max.loggedOut).toBe(1)
    expect(held(here.keyring, "personal")).toBe(false)
    for (const suffix of [".json", ".sock.refused", ".serve.log"])
      expect(existsSync(join(here.profiles, `personal${suffix}`))).toBe(false)
    expect(held(here.keyring, "work")).toBe(true)
    expect(existsSync(join(here.profiles, "work.json"))).toBe(true)
    expect(held(here.keyring, "bot:personal")).toBe(true)
  })

  it("**--delete-data forgets the same sign-in** and answers that the data went", async () => {
    const here = setup()

    const { code, item } = await maxCli(["work", "account", "remove", "--delete-data", "--yes", "--json"], here)

    expect(code).toBe(0)
    expect(item.data).toBe("deleted")
    expect(held(here.keyring, "work")).toBe(false)
    expect(held(here.keyring, "personal")).toBe(true)
  })

  it("**succeeds on a profile that is already signed out** and logs nothing out", async () => {
    const here = setup()
    here.keyring.delete(SERVICE, "work")
    max.loggedOut = 0

    const { code, item } = await maxCli(["work", "account", "remove", "--keep-data", "--yes", "--json"], here)

    expect(code).toBe(0)
    expect(item.revoked).toBeNull()
    expect(max.loggedOut).toBe(0)
    expect(existsSync(join(here.profiles, "work.json"))).toBe(false)
  })

  it("**keeps the session when MAX does not log it out**", async () => {
    const here = setup()
    max.failWith = new Error("network down")

    const { code } = await maxCli(["personal", "account", "remove", "--keep-data", "--yes", "--json"], here)
    max.failWith = undefined

    expect(code).not.toBe(0)
    expect(held(here.keyring, "personal")).toBe(true)
    expect(existsSync(join(here.profiles, "personal.json"))).toBe(true)
  })

  it("**refuses while max serve holds the profile** and logs nothing out", async () => {
    const here = setup()
    const lock = lockPath(MAX_APP, "personal", here.env)
    mkdirSync(dirname(lock), { recursive: true, mode: 0o700 })
    holdLock(lock, { pid: process.pid, startedAt: new Date().toISOString() })
    max.loggedOut = 0

    const { code } = await maxCli(["personal", "account", "remove", "--keep-data", "--yes", "--json"], here)

    expect(code).not.toBe(0)
    expect(max.loggedOut).toBe(0)
    expect(held(here.keyring, "personal")).toBe(true)
  })

  it("**does not log out when the run may not revoke**", async () => {
    const here = setup()
    max.loggedOut = 0

    const signed = await MAX_REMOVAL.signOut("personal", { env: here.env, keyring: here.keyring, mayRevoke: false })

    expect(signed).toEqual({ revoked: false, removed: ["the MAX session"] })
    expect(max.loggedOut).toBe(0)
  })
})
