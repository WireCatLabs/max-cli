import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP as app } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const profile = "paging-local"
const max = async (words: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, ...words], {
    streams,
    tty: false,
    store: () => {
      const s = new SessionStore({ profile, keyring: memoryKeyring() })
      s.writeState({ ...s.readState(), viewerId: "503" })
      return s
    },
    connection: () => {
      throw new Error("offline reads never connect")
    },
  })
  return { code, out: streams.stdout.join("\n"), err: streams.stderr.join("\n") }
}

beforeAll(() => {
  rememberAccount(app, profile, "503", process.env)
})

describe("paging options on local lists", () => {
  it.each([
    ["store", "jobs", "list", "--limit", "1"],
    ["store", "jobs", "list", "--page", "1"],
    ["store", "jobs", "list", "--all"],
    ["searches", "history", "--page", "1"],
    ["searches", "history", "--all"],
    ["sends", "list", "--page", "1"],
    ["sends", "list", "--all"],
  ])("%s answers in the envelope", async (...words) => {
    const answered = await max([...words, "--json"])
    expect(answered.code, answered.err).toBe(0)
    expect(JSON.parse(answered.out)).toMatchObject({ items: expect.any(Array), page: expect.any(Object) })
  })
})
