import { readFileSync } from "node:fs"
import { captureStreams } from "@wirecat/cli-core"
import { SendJournal } from "@wirecat/cli-messaging/sends"
import { describe, expect, it } from "vitest"
import { run } from "../program.js"
import { sendsPathFor } from "../sends.js"

const cli = async (args: string[]) => {
  const streams = captureStreams()
  const code = await run(args, {
    streams,
    tty: false,
    connection: () => {
      throw new Error("local command connected")
    },
  })
  return { code, stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
}

describe("local command parity", () => {
  it("honors configured and explicit sends limits without altering the journal", async () => {
    const profile = "local-parity"
    const journal = new SendJournal(sendsPathFor(profile))
    for (let index = 0; index < 3; index++)
      journal.append({ at: `2026-10-01T00:00:0${index}Z`, profile, chatId: "111", outcome: "sent" })
    const before = readFileSync(sendsPathFor(profile), "utf8")
    expect((await cli([profile, "config", "set", "limit", "2"])).code).toBe(0)
    const configured = await cli([profile, "sends", "list", "--json"])
    expect(configured.code).toBe(0)
    expect(JSON.parse(configured.stdout)).toMatchObject({ page: 1, limit: 2, hasMore: true })
    expect(JSON.parse(configured.stdout).items).toHaveLength(2)
    const explicit = await cli([profile, "sends", "list", "--limit", "1", "--json"])
    expect(explicit.code).toBe(0)
    expect(JSON.parse(explicit.stdout)).toMatchObject({ limit: 1, hasMore: true })
    expect(JSON.parse(explicit.stdout).items).toHaveLength(1)
    expect(readFileSync(sendsPathFor(profile), "utf8")).toBe(before)
  })

  it("exposes the shared named skill without a session and rejects unknown names", async () => {
    const named = await cli(["skill", "show", "link-conversations"])
    expect(named.code).toBe(0)
    expect(named.stdout).toContain("link-conversations")
    const defaultSkill = await cli(["skill", "show"])
    expect(defaultSkill.code).toBe(0)
    expect(defaultSkill.stdout).toContain("max-cli")
    const unknown = await cli(["skill", "show", "absent"])
    expect(unknown.code).not.toBe(0)
    expect(unknown.stdout).toBe("")
  })
})
