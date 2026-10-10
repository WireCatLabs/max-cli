import { readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "charts-synthetic"
const account = { provider: "max", account: "500" }
const keyring = memoryKeyring()
const connect = vi.fn(() => {
  throw new Error("charts test must not connect")
})

beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  const store = await openStore()
  try {
    await store.saveChats(account, [
      {
        id: "7",
        title: "Synthetic club",
        kind: "group",
        unreadCount: 0,
        participantsCount: 3,
        lastMessageAt: "2026-10-03T12:00:00Z",
      },
    ])
    await store.saveMessages(
      account,
      "7",
      ["01", "03"].map((day, index) => ({
        id: String(index + 1),
        chatId: "7",
        senderId: "11",
        senderName: "Synthetic author",
        timestamp: `2026-10-${day}T12:00:00Z`,
        text: "synthetic",
        outgoing: false,
        editedAt: null,
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
        attachments: [],
      })),
      { via: "test" },
    )
  } finally {
    await store.close()
  }
})
afterAll(() => expect(connect).not.toHaveBeenCalled())

const invoke = async (...options: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, "stats", "charts", "7", "--offline", "--no-record", "--json", ...options], {
    streams,
    tty: false,
    connection: connect,
    store: () => {
      const session = new SessionStore({ profile, keyring })
      session.writeState({ ...session.readState(), viewerId: account.account })
      return session
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("stats charts adoption", () => {
  it("returns neutral chart JSON with gaps and saves a dark private SVG", async () => {
    const output = join(tmpdir(), "synthetic-activity.svg")
    const result = await invoke(
      "--chart-kind",
      "active",
      "--by",
      "day",
      "--since-time",
      "2026-10-01T00:00:00Z",
      "--timezone",
      "Europe/Madrid",
      "--output",
      output,
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      chart: {
        version: 1,
        kind: "line",
        timezone: "Europe/Madrid",
        partial: true,
        x: { type: "day", values: ["2026-10-01", "2026-10-02", "2026-10-03"] },
        series: [{ values: [1, null, 1] }],
      },
      chartFile: { path: output, format: "svg", width: 800, height: 400 },
    })
    expect(readFileSync(output, "utf8")).toContain('fill="#111827"')
    if (process.platform !== "win32") expect(statSync(output).mode & 0o777).toBe(0o600)
    expect(result.stderr).toContain("partial data")
    expect((await invoke("--output", output)).code).toBe(2)
  })

  it("keeps chart data available without a file and refuses unavailable memberships", async () => {
    const result = await invoke("--by", "week", "--since-time", "2026-10-01")
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ chart: { kind: "bar", x: { type: "week" } } })
    expect(JSON.parse(result.stdout)).not.toHaveProperty("chartFile")
    const membership = await invoke("--chart-kind", "membership")
    expect(membership.code).toBe(2)
    expect(membership.stderr).toContain("unavailable")
    expect((await invoke("--output", "chart.jpg")).code).toBe(2)
  })

  it("exports a private PNG from the same offline data", async () => {
    const output = join(tmpdir(), "synthetic-activity.png")
    const result = await invoke("--since-time", "2026-10-01", "--timezone", "UTC", "--output", output)
    expect(result.code).toBe(0)
    const body = JSON.parse(result.stdout)
    expect(body).toMatchObject({ chartFile: { path: output, format: "png", width: 800, height: 400 } })
    expect(body.chart).toEqual(
      JSON.parse((await invoke("--since-time", "2026-10-01", "--timezone", "UTC")).stdout).chart,
    )
    const png = readFileSync(output)
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([800, 400])
    if (process.platform !== "win32") expect(statSync(output).mode & 0o777).toBe(0o600)
    expect((await invoke("--output", output)).code).toBe(2)
    expect(readFileSync(output)).toEqual(png)
  })
})
