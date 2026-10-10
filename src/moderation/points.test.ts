import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-core"
import { describe, expect, it } from "vitest"
import { SessionStore } from "../session/store.js"
import { migrateModerationPoints, moderationPoints } from "./points.js"
import { ModerationRules as LegacyRules } from "./rules.js"

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "moderation-points-"))
  const env = { ...process.env, MAX_STATE_DIR: directory }
  const store = new SessionStore({ profile: "test", env, keyring: memoryKeyring() })
  return { env, store }
}
const first = "2026-10-01T10:00:00.000Z"
const second = "2026-10-02T10:00:00.000Z"

describe("moderation checkpoints", () => {
  it("copies every missing legacy point once, preserving newer rules points and legacy rule edits", () => {
    const { env, store } = fixture()
    store.writeState({ ...store.readState(), checkedUntil: { "-1": first, "-2": first } })
    const shared = migrateModerationPoints(store, env)
    expect(shared.checkedUntil("-1")).toBe(first)
    expect(shared.checkedUntil("-2")).toBe(first)
    shared.markChecked("-1", second)
    const legacy = new LegacyRules(shared.path)
    legacy.set("-1", "Team", "trusted", "-3,4")
    legacy.unset("-1", "Team", "links")
    expect(migrateModerationPoints(store, env).checkedUntil("-1")).toBe(second)
    expect(shared.read("-1")?.trusted).toEqual(["-3", "4"])
    expect(JSON.parse(readFileSync(shared.path, "utf8")).checkedUntil).toEqual({ "-1": second, "-2": first })
  })

  it("legacy MCP and shared CLI advance the same point without writing session progress", () => {
    const { env, store } = fixture()
    store.writeState({ ...store.readState(), checkedUntil: { "-1": first } })
    const points = moderationPoints(store, env)
    expect(points.read("-1")).toBe(first)
    points.write("-1", second)
    const shared = migrateModerationPoints(store, env)
    expect(shared.checkedUntil("-1")).toBe(second)
    shared.markChecked("-1", "2026-10-03T10:00:00.000Z")
    expect(points.read("-1")).toBe("2026-10-03T10:00:00.000Z")
    expect(store.readState().checkedUntil).toEqual({ "-1": first })
  })

  it("refuses invalid missing legacy dates before copying any point", () => {
    const { env, store } = fixture()
    store.writeState({ ...store.readState(), checkedUntil: { "-1": first, "-2": "broken" } })
    expect(() => migrateModerationPoints(store, env)).toThrow(/saved moderation time for chat -2 is invalid/)
    store.writeState({ ...store.readState(), checkedUntil: {} })
    expect(migrateModerationPoints(store, env).checkedUntil("-1")).toBeUndefined()
  })
})
