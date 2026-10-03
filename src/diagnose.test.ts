import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MIGRATIONS, openCache, openStore } from "@leemour/cli-messaging/store"
import { beforeEach, describe, expect, it } from "vitest"
import { diagnose, knownProfiles } from "./diagnose.js"

let home: string

const at = (...parts: string[]) => join(home, ...parts)

const withState = (profile: string, state: Record<string, unknown>) => {
  mkdirSync(at("state", "profiles"), { recursive: true })
  writeFileSync(at("state", "profiles", `${profile}.json`), JSON.stringify(state))
}

const look = ({ env = {}, ...over }: Partial<Parameters<typeof diagnose>[0]> = {}) =>
  diagnose({
    profile: "default",
    env: { ...env, MESSAGING_STORE: at("messages.db") },
    stateDir: at("state"),
    cacheDir: at("cache"),
    ...over,
  })

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "max-doctor-"))
})

describe("what a command depends on", () => {
  it("**answers on a machine where nothing exists**, which is when it is run", async () => {
    const report = await look()

    expect(report.session.exists).toBe(false)
    expect(report.token).toEqual({ present: false, from: "none" })
    expect(report.legacyCache.exists).toBe(false)
    expect(report.loggedInProfiles).toEqual([])
  })

  it("**does not create the state file it reports on**", async () => {
    await look()

    // `SessionStore.readState` invents a device identity and writes it out on first read. A
    // diagnosis that does that is reporting on its own side effect.
    expect((await look()).session.exists).toBe(false)
  })

  it("reads the login count and the last login, which is what RISK-2 wants counted", async () => {
    withState("default", { deviceId: "d", viewerId: "v", logins: 7, lastLoginAt: "2026-09-23T10:00:00.000Z" })
    const report = await look()

    expect(report.session).toMatchObject({ exists: true, deviceId: true, viewerId: true, logins: 7 })
    expect(report.session.lastLoginAt).toBe("2026-09-23T10:00:00.000Z")
  })

  it("reports the web client version we present, fresh until 60 days after it was read", async () => {
    const readOn = Date.parse((await look()).client.readOn)
    const daysLater = (days: number) => () => new Date(readOn + days * 86_400_000)

    expect((await look({ now: daysLater(60) })).client).toMatchObject({ ageDays: 60, stale: false })
    expect((await look({ now: daysLater(61) })).client).toMatchObject({ ageDays: 61, stale: true })
  })

  it("treats a state file that is not JSON as no session, rather than throwing", async () => {
    mkdirSync(at("state", "profiles"), { recursive: true })
    writeFileSync(at("state", "profiles", "default.json"), "{ not json")

    expect((await look()).session.exists).toBe(false)
  })

  it("**lists the profiles that are logged in**, which is not the list `config show` can give", async () => {
    withState("default", { deviceId: "d", logins: 1 })
    withState("work", { deviceId: "e", logins: 2 })

    expect((await look()).loggedInProfiles).toEqual(["default", "work"])
  })

  it("does not take a profile's moderation rules for another profile", async () => {
    withState("work", { deviceId: "e", logins: 2 })
    writeFileSync(at("state", "profiles", "work.moderation.json"), "{}")

    expect((await look()).loggedInProfiles).toEqual(["work"])
  })

  it("lists every profile with what it holds: personal, bot, both, or only configured", async () => {
    withState("home", { deviceId: "d", logins: 1 })
    withState("both", { deviceId: "e", logins: 1 })
    mkdirSync(at("state", "bots", "joins"), { recursive: true })
    writeFileSync(at("state", "bots", "shop.json"), JSON.stringify({ chats: [] }))
    writeFileSync(at("state", "bots", "both.json"), JSON.stringify({ chats: [] }))
    writeFileSync(at("state", "profiles", "home.moderation.json"), "{}")

    expect(knownProfiles({ stateDir: at("state"), configured: ["planned"] })).toEqual([
      { name: "both", personal: true, bot: true, configured: false },
      { name: "home", personal: true, bot: false, configured: false },
      { name: "planned", personal: false, bot: false, configured: true },
      { name: "shop", personal: false, bot: true, configured: false },
    ])
  })

  it("reports the bot side of a profile, never its token", async () => {
    mkdirSync(at("state", "bots"), { recursive: true })
    writeFileSync(at("state", "bots", "shop.json"), JSON.stringify({ botId: "42", chats: [{ id: "1" }, { id: "2" }] }))

    const report = await look({
      profile: "shop",
      storedBotToken: (profile: string) => (profile === "shop" ? "keyring" : undefined),
    })

    expect(report.bot).toMatchObject({
      token: { present: true, from: "keyring" },
      registry: { exists: true, botKnown: true, chats: 2 },
    })
    expect(report.profiles).toEqual([{ name: "shop", personal: false, bot: true, configured: false }])
    expect(JSON.stringify(report)).not.toContain('"42"')
  })

  describe("the token", () => {
    it("says it came from the environment, and never what it is", async () => {
      const report = await look({ env: { MAX_TOKEN: "a-secret" }, storedToken: () => "keyring" })

      expect(report.token).toEqual({ present: true, from: "environment" })
      expect(JSON.stringify(report)).not.toContain("a-secret")
    })

    it("falls back to the keyring, and reports nothing when neither has one", async () => {
      expect((await look({ storedToken: () => "keyring" })).token).toEqual({ present: true, from: "keyring" })
      expect((await look({ storedToken: () => "file" })).token).toEqual({ present: true, from: "file" })
      expect((await look({ storedToken: () => undefined })).token).toEqual({ present: false, from: "none" })
    })
  })

  describe("the keyring entry the environment moves", () => {
    it("**says so when one of the three variables is set** — the failure with no other symptom", async () => {
      const report = await look({ env: { MAX_CONFIG_DIR: "/tmp/elsewhere" } })

      expect(report.keyring.movedByEnvironment).toBe(true)
      expect(report.keyring.service).not.toBe("max-cli")
    })

    it("says the plain service name when nothing moved it", async () => {
      expect((await look()).keyring).toEqual({ service: "max-cli", movedByEnvironment: false })
    })
  })

  describe("the shared store", () => {
    it("does not create a missing store", async () => {
      expect((await look()).store).toMatchObject({ exists: false, path: at("messages.db") })
      expect(existsSync(at("messages.db"))).toBe(false)
    })

    it("reports a broken store without failing the diagnosis", async () => {
      writeFileSync(at("messages.db"), "not SQLite")
      expect((await look()).store).toMatchObject({ exists: true, error: expect.any(String) })
    })

    it("reports schema and counts without migrating an old file", async () => {
      const database = await openCache(at("messages.db"))
      try {
        database.exec(
          "CREATE TABLE schema_migrations (version INTEGER, min_compatible INTEGER); INSERT INTO schema_migrations VALUES (1, 1); CREATE TABLE chats (id INTEGER); CREATE TABLE messages (id INTEGER); INSERT INTO messages VALUES (1)",
        )
      } finally {
        database.close()
      }
      expect((await look()).store).toMatchObject({ schema: 1, writable: true, chats: 0, messages: 1 })
      const reopened = await openCache(at("messages.db"))
      try {
        expect(reopened.prepare("SELECT version FROM schema_migrations").get()?.version).toBe(1)
      } finally {
        reopened.close()
      }
    })

    it("reports an incompatible future schema", async () => {
      const env = { MESSAGING_STORE: at("messages.db") }
      await (await openStore({ env })).close()
      const database = await openCache(at("messages.db"))
      const future = (MIGRATIONS.at(-1)?.version ?? 0) + 1
      try {
        database.exec(
          `INSERT INTO schema_migrations (version, min_compatible, applied_at) VALUES (${future}, ${future}, 0)`,
        )
      } finally {
        database.close()
      }
      expect((await look()).store).toMatchObject({ schema: future, writable: false })
    })

    it("names the legacy file without opening or changing it", async () => {
      mkdirSync(at("cache"), { recursive: true })
      writeFileSync(at("cache", "default.db"), "old and unreadable")
      expect((await look()).legacyCache).toEqual({ exists: true, file: at("cache", "default.db") })
      expect(readFileSync(at("cache", "default.db"), "utf8")).toBe("old and unreadable")
    })
  })
})
