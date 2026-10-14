import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP as app } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

const account = { provider: "max", account: "503" }
const profile = "mentions-local"
const max = async (words: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, ...words], {
    streams,
    tty: false,
    store: () => {
      const s = new SessionStore({ profile, keyring: memoryKeyring() })
      s.writeState({ ...s.readState(), viewerId: account.account })
      return s
    },
    connection: () => {
      throw new Error("mentions never connect")
    },
  })
  return { code, out: streams.stdout.join("\n"), err: streams.stderr.join("\n") }
}
const message = (id: string, text: string, timestamp: string) => ({
  id,
  chatId: "7",
  senderId: "11",
  senderName: null,
  text,
  timestamp,
  editedAt: null,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

beforeAll(async () => {
  rememberAccount(app, profile, account.account, process.env)
  const store = await openStore()
  try {
    await store.saveMessages(
      account,
      "7",
      [
        message("201", "звони +7 900 000-00-01", "2026-10-04T10:00:00Z"),
        message("202", "смета на https://example.com/smeta?utm_source=max", "2026-10-05T10:00:00Z"),
      ],
      { via: "fixture" },
    )
  } finally {
    await store.close()
  }
})

describe("mentions through max", () => {
  it("lists phones and links found in stored messages, page by page, shows one, and rebuilds", async () => {
    const all = await max(["mentions", "list", "kind:phone", "--json"])
    expect(all.code, all.err).toBe(0)
    expect(JSON.parse(all.out).items).toMatchObject([{ kind: "phone", value: "+79000000001" }])

    const first = await max(["mentions", "list", "--limit", "1", "--page", "1", "--json"])
    expect(JSON.parse(first.out)).toMatchObject({ items: [{ kind: "url", value: "https://example.com/smeta" }] })
    const second = await max(["mentions", "list", "--limit", "1", "--page", "2", "--json"])
    const [phone] = JSON.parse(second.out).items
    expect(phone).toMatchObject({ kind: "phone", locator: "msg:max/503/7/201" })

    const shown = await max(["mentions", "show", String(phone.id), "--json"])
    expect(shown.code, shown.err).toBe(0)
    expect(JSON.parse(shown.out).item).toMatchObject({ written: "+7 900 000-00-01", before: "звони " })

    const rebuilt = await max(["mentions", "rebuild", "--json"])
    expect(rebuilt.code, rebuilt.err).toBe(0)
    expect(JSON.parse(rebuilt.out).item.mentions).toBeGreaterThanOrEqual(2)
  })
})
