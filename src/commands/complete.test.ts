import { existsSync } from "node:fs"
import { captureStreams } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeAll, describe, expect, it } from "vitest"
import { MAX_APP } from "../app.js"
import { ChatRegistry } from "../bot/registry.js"
import { profileCacheFile } from "../cache/index.js"
import { run } from "../program.js"

const complete = async (...words: string[]) => {
  const streams = captureStreams()
  const code = await run(["complete", "--", ...words], { streams })
  return { code, lines: streams.stdout.join("\n").split("\n"), stderr: streams.stderr }
}

const values = (lines: string[]) => lines.filter((line) => !line.startsWith(":")).map((line) => line.split("\t")[0])

beforeAll(async () => {
  rememberAccount(MAX_APP, "tabbed", "500", process.env)
  const store = await openStore()
  await store.saveChats({ provider: "max", account: "500" }, [
    { id: "101", title: "Family", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 3 },
    { id: "102", title: "Work chat", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 5 },
    { id: "103", title: "Evil\u001b[2K", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 2 },
    { id: "104", title: "$(touch x)", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 2 },
    { id: "105", title: "ok\n$(touch y)", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 2 },
  ])
  await store.savePeople({ provider: "max", account: "500" }, [
    { id: "7", name: "Иван Петров", username: "ivan", description: null },
    { id: "8", name: "Eve\n$(touch z)", username: "$(touch w)", description: null },
  ])
  await store.close()
})

describe("max complete", () => {
  it("offers the commands, itself included, and ends with the directive", async () => {
    const { code, lines, stderr } = await complete("")
    expect(code).toBe(0)
    expect(values(lines)).toContain("chats")
    expect(values(lines)).toContain("complete")
    expect(lines.at(-1)).toBe(":4")
    expect(stderr).toEqual([])
  })

  it("completes a half-typed first word as a command, not as a profile", async () => {
    const { lines } = await complete("mess")
    expect(values(lines)).toEqual(["messages"])
  })

  it("offers chat ids with their titles beside them, never a title as the word", async () => {
    const { lines } = await complete("tabbed", "messages", "list", "")
    expect(lines).toContain("101\tFamily")
    expect(lines).toContain("102\tWork chat")
    expect(values(lines)).toEqual(["101", "102", "103", "104", "105"])
  })

  it("does not offer another account's chats or people", async () => {
    rememberAccount(MAX_APP, "other", "600", process.env)
    const store = await openStore()
    try {
      await store.saveChats({ provider: "max", account: "600" }, [
        { id: "201", title: "Other", kind: "group", unreadCount: 0, lastMessageAt: null, participantsCount: 2 },
      ])
      await store.savePeople({ provider: "max", account: "600" }, [{ id: "9", name: "Another account" }])
    } finally {
      await store.close()
    }
    expect(values((await complete("tabbed", "messages", "list", "")).lines)).not.toContain("201")
    expect(values((await complete("tabbed", "contacts", "show", "")).lines)).not.toContain("9")
    expect(values((await complete("other", "messages", "list", "")).lines)).toEqual(["201"])
  })

  it("offers a bot's own chats to a bot command, not the personal account's", async () => {
    const registry = new ChatRegistry("tabbed")
    registry.observe([{ id: "-900", title: "Shop group" }])
    const { lines } = await complete("tabbed", "bot", "messages", "list", "")
    expect(values(lines)).toEqual(["-900"])
    expect(lines).toContain("-900\tShop group")
  })

  it("offers profiles that hold only a bot as a first word", async () => {
    new ChatRegistry("shopbot").touch()
    const { lines } = await complete("")
    expect(values(lines)).toContain("shopbot")
  })

  it("shows a title's control characters instead of passing them to the shell", async () => {
    const { lines } = await complete("tabbed", "messages", "list", "")
    expect(lines).toContain("103\tEvil\\x1b[2K")
    expect(lines.join("\n")).not.toContain("\u001b")
  })

  it("gives bash no word a title or a name could run code from", async () => {
    const chats = await complete("tabbed", "messages", "list", "")
    const people = await complete("tabbed", "contacts", "show", "")

    expect(chats.lines).toContain("105\tok\\x0a$(touch y)")
    for (const { lines } of [chats, people]) {
      expect(values(lines).every((word) => /^\d+$/.test(word ?? ""))).toBe(true)
    }
    expect(people.lines).toContain("8\tEve\\x0a$(touch z)")
  })

  it("offers nothing for a chat when this profile has no account, and creates no legacy cache", async () => {
    const { code, lines } = await complete("nocache", "messages", "list", "")
    expect(code).toBe(0)
    expect(lines).toEqual([":4"])
    expect(existsSync(profileCacheFile("nocache"))).toBe(false)
  })

  it("offers no names for a first word that cannot be a profile name", async () => {
    const { code, lines } = await complete("../outside", "messages", "list", "")
    expect(code).toBe(0)
    expect(lines).toEqual([":4"])
  })

  it("refuses a shell it does not know, on stderr", async () => {
    const streams = captureStreams()
    expect(await run(["complete", "tcsh"], { streams })).toBe(2)
    expect(streams.stdout).toEqual([])
    expect(streams.stderr.join("")).toContain("zsh")
  })
})
