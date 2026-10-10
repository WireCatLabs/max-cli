import { captureStreams, memoryKeyring } from "@wirecat/cli-core"
import type { Message } from "@wirecat/cli-messaging"
import { rememberAccount } from "@wirecat/cli-messaging/cli"
import { openStore } from "@wirecat/cli-messaging/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { run } from "../program.js"
import { SessionStore } from "../session/store.js"

const account = { provider: "max", account: "502" }
const profile = "check-local"
const SPAM = "Earn a lot from home every day, write to me for the details"
const state = () => {
  const stored = new SessionStore({ profile, keyring: memoryKeyring() })
  stored.writeState({ ...stored.readState(), viewerId: account.account })
  return stored
}
const said = (id: string, chatId: string): Message => ({
  id,
  chatId,
  senderId: "77",
  senderName: null,
  text: SPAM,
  timestamp: "2026-09-02T10:00:00.000Z",
  editedAt: null,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})
const cli = async (words: string[]) => {
  const streams = captureStreams()
  const code = await run([profile, ...words], {
    streams,
    tty: false,
    store: state,
    connection: () => {
      throw new Error("an offline check must never open a wire")
    },
  })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

beforeAll(async () => {
  rememberAccount(MAX_APP, profile, account.account, process.env)
  state()
  const store = await openStore()
  try {
    const group = (id: string, title: string) => ({
      id,
      title,
      kind: "group" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    })
    await store.saveChats(account, [group("7", "Synthetic One"), group("8", "Synthetic Two")])
    await store.savePeople(account, [{ id: "77", name: "Synthetic Seller", username: null }])
    for (const chatId of ["7", "8"]) {
      await store.saveMembers(account, chatId, ["77", account.account])
      await store.saveMessages(account, chatId, [said(`1${chatId}`, chatId)], { via: "test" })
    }
  } finally {
    await store.close()
  }
})

describe("contacts check on MAX", () => {
  it("judges a person from the store alone, and asks no ban list", async () => {
    const offline = await cli(["contacts", "check", "77", "--offline", "--json"])
    const quiet = await cli(["contacts", "check", "77", "--offline", "--no-registries", "--json"])

    expect(offline.code).toBe(0)
    const answer = JSON.parse(offline.stdout)
    expect(answer.person).toMatchObject({ id: "77", provider: "max" })
    expect(answer.reasons.map(({ reason }: { reason: string }) => reason)).toEqual(
      expect.arrayContaining(["same_text", "no_username"]),
    )
    expect(answer.registries).toEqual([])
    expect(offline.stderr).toContain("offline: the ban lists were not asked")
    expect(quiet.code).toBe(0)
    expect(quiet.stderr).toContain("the ban lists were not asked")
  })
})
