import { readFileSync } from "node:fs"
import { captureStreams } from "@leemour/cli-core"
import { repliesPathFor } from "@leemour/cli-messaging/cli"
import { describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"

describe("shared reply editor adoption", () => {
  it("edits and clears every supported field locally, keeping rules off until explicitly enabled", async () => {
    const profile = "reply-edit-synthetic"
    const connection = vi.fn(() => {
      throw new Error("reply editors must not connect")
    })
    const call = async (...args: string[]) => {
      const streams = captureStreams()
      const code = await run([profile, "replies", ...args, "--json", "--no-record"], {
        streams,
        tty: false,
        connection,
      })
      expect(code, streams.stderr.join("\n")).toBe(0)
      return JSON.parse(streams.stdout.join("\n"))
    }
    expect(await call("add", "away")).toMatchObject({ id: "away", on: false })
    const changed = await call(
      "edit",
      "away",
      "--do",
      "reply,task",
      "--kinds",
      "dialog,group",
      "--chats",
      "11,12",
      "--not-chats",
      "13",
      "--words",
      "help,price",
      "--question",
      "--mentions-me",
      "--people",
      "21",
      "--not-people",
      "22",
      "--contacts-only",
      "--template",
      "Thanks {firstName}",
      "--model",
      "fill-only",
      "--no-as-reply",
      "--per-chat",
      "2/12h",
      "--per-person",
      "3/1d",
      "--outside",
      "09:00-19:00",
      "--days",
      "mon-fri",
      "--timezone",
      "Europe/Madrid",
    )
    expect(changed).toMatchObject({
      on: false,
      do: ["reply", "task"],
      where: { kinds: ["dialog", "group"], chats: ["11", "12"], notChats: ["13"] },
      when: {
        words: ["help", "price"],
        question: true,
        mentionsMe: true,
        from: { people: ["21"], notPeople: ["22"], contactsOnly: true },
        hours: { outside: "09:00-19:00", days: "mon-fri", timezone: "Europe/Madrid" },
      },
      reply: { template: "Thanks {firstName}", model: "fill-only", asReply: false },
      limits: { perChat: "2/12h", perPerson: "3/1d" },
    })
    expect(await call("on", "away")).toMatchObject({ on: true })
    expect(await call("off", "away")).toMatchObject({ on: false })
    const cleared = await call(
      "edit",
      "away",
      "--no-question",
      "--no-mentions-me",
      "--no-contacts-only",
      "--as-reply",
      "--no-hours",
    )
    expect(cleared).toMatchObject({
      when: { question: false, mentionsMe: false, from: { contactsOnly: false } },
      reply: { asReply: true },
    })
    expect(cleared.when.hours).toBeNull()
    const audience = await call(
      "audience",
      "--reply",
      "listed",
      "--allow-people",
      "21",
      "--allow-chats",
      "11",
      "--deny-people",
      "22",
      "--deny-chats",
      "13",
    )
    expect(audience).toMatchObject({
      reply: "listed",
      allow: { people: ["21"], chats: ["11"] },
      deny: { people: ["22"], chats: ["13"] },
    })
    const saved = JSON.parse(readFileSync(repliesPathFor(MAX_APP, profile, process.env), "utf8"))
    expect(saved.rules[0]).toEqual(cleared)
    expect(connection).not.toHaveBeenCalled()
  })
})
