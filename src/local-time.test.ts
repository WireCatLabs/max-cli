import { afterEach, describe, expect, it } from "vitest"
import { createMessageReads } from "./client/message-reads.js"
import { shownTime } from "./output.js"
import { withLoginRefused } from "./session/store.js"

const zoneBefore = process.env.TZ
afterEach(() => {
  if (zoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = zoneBefore
})

const now = Date.parse("2026-10-21T12:00:00.000Z")
const reads = createMessageReads({ now: () => now } as unknown as Parameters<typeof createMessageReads>[0])

describe("times a person types and reads", () => {
  it("shows a UTC time in the zone it names", () => {
    expect(shownTime("2026-10-21T14:03:00.000Z", "UTC")).toBe("2026-10-21 14:03 UTC")
    expect(shownTime("2026-10-21T14:03:00.000Z", "Europe/Madrid")).toBe("2026-10-21 16:03 Europe/Madrid")
    expect(shownTime("2026-10-21T14:03:00.000Z", "Asia/Vladivostok")).toBe("2026-10-22 00:03 Asia/Vladivostok")
  })

  it("reads --before without a zone on the computer's clock, and a date alone as its local midnight", () => {
    process.env.TZ = "Asia/Vladivostok"
    expect(reads.moment("2026-09-01")).toBe(Date.parse("2026-08-31T14:00:00.000Z"))
    expect(reads.moment("2026-09-01T10:00")).toBe(Date.parse("2026-09-01T00:00:00.000Z"))
    process.env.TZ = "America/Los_Angeles"
    expect(reads.moment("2026-09-01")).toBe(Date.parse("2026-09-01T07:00:00.000Z"))
  })

  it("lets a zone the value names win over the computer's", () => {
    process.env.TZ = "Asia/Vladivostok"
    expect(reads.moment("2026-09-01T10:00:00Z")).toBe(Date.parse("2026-09-01T10:00:00.000Z"))
    expect(reads.moment("2026-09-01T10:00:00+02:00")).toBe(Date.parse("2026-09-01T08:00:00.000Z"))
  })

  it("still refuses what is not a time, naming the flag", () => {
    expect(() => reads.moment("yesterday", "--after")).toThrow(/--after takes a message id/)
  })

  it("stores the same login pause whatever zone the computer is in", () => {
    process.env.TZ = "Asia/Vladivostok"
    const east = withLoginRefused({ deviceId: "d", logins: 1 }, now)
    process.env.TZ = "America/Los_Angeles"
    expect(withLoginRefused({ deviceId: "d", logins: 1 }, now)).toEqual(east)
    expect(east.loginPausedUntil).toMatch(/Z$/)
  })
})
