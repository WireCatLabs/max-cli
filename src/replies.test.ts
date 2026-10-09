import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { rememberAccount } from "@leemour/cli-messaging/cli"
import { openStore } from "@leemour/cli-messaging/store"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import { run } from "./program.js"
import { SessionStore } from "./session/store.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "max-reply-options-"))
  vi.stubEnv("MAX_CONFIG_DIR", join(root, "config"))
  vi.stubEnv("MAX_STATE_DIR", join(root, "state"))
  vi.stubEnv("MESSAGING_STORE", join(root, "messages.db"))
  vi.stubEnv("MAX_PROFILE", "default")
  const env = process.env
  const never = vi.fn(() => {
    throw new Error("local reply commands must never connect")
  })
  const keyring = memoryKeyring()
  const invoke = async (...argv: string[]) => {
    const streams = captureStreams()
    const code = await run(["default", ...argv, "--json"], {
      streams,
      tty: false,
      connection: never,
      store: (profile) => new SessionStore({ profile, keyring }),
    })
    return { code, data: streams.stdout.join(""), diagnostics: streams.stderr.join("") }
  }
  return { invoke, never, env, app: MAX_APP, provider: "max", file: join(root, "config", "default.replies.json") }
}

describe("reply editors and model templates", () => {
  it("drives every rule option and its inverse without connecting", async () => {
    const { invoke, file, never } = setup()
    expect((await invoke("replies", "add", "away")).code).toBe(0)
    expect((await invoke("replies", "on", "away")).code).toBe(2)
    const edited = await invoke(
      "replies",
      "edit",
      "away",
      "--do",
      "reply,task",
      "--kinds",
      "dialog,group",
      "--chats",
      "900719925474099399,20",
      "--not-chats",
      "21",
      "--words",
      "price,help",
      "--question",
      "--mentions-me",
      "--people",
      "11",
      "--not-people",
      "12",
      "--contacts-only",
      "--template",
      "Hi {{ sender.name }}",
      "--model",
      "fill-only",
      "--no-as-reply",
      "--per-chat",
      "2/12h",
      "--per-person",
      "3/1d",
      "--outside",
      "22:00-02:00",
      "--days",
      "fri-mon",
      "--timezone",
      "Europe/Madrid",
    )
    expect(edited.code).toBe(0)
    expect(JSON.parse(edited.data)).toMatchObject({
      do: ["reply", "task"],
      where: { kinds: ["dialog", "group"], chats: ["900719925474099399", "20"], notChats: ["21"] },
      when: {
        hours: { outside: "22:00-02:00", days: "fri-mon", timezone: "Europe/Madrid" },
        words: ["price", "help"],
        question: true,
        mentionsMe: true,
        from: { people: ["11"], notPeople: ["12"], contactsOnly: true },
      },
      reply: { template: "Hi {{ sender.name }}", model: "fill-only", asReply: false },
      limits: { perChat: "2/12h", perPerson: "3/1d" },
    })
    expect((await invoke("replies", "on", "away")).code).toBe(0)
    expect((await invoke("replies", "off", "away")).code).toBe(0)
    expect(
      (
        await invoke(
          "replies",
          "edit",
          "away",
          "--no-question",
          "--no-mentions-me",
          "--no-contacts-only",
          "--as-reply",
          "--no-hours",
          "--chats",
          "",
          "--not-chats",
          "",
          "--people",
          "",
          "--not-people",
          "",
          "--words",
          "",
          "--kinds",
          "",
        )
      ).code,
    ).toBe(0)
    const cleared = JSON.parse(readFileSync(file, "utf8")).rules[0]
    expect(cleared.when).toEqual({
      hours: null,
      words: [],
      question: false,
      mentionsMe: false,
      from: { people: [], notPeople: [], contactsOnly: false },
    })
    expect(cleared.reply.asReply).toBe(true)
    const before = readFileSync(file, "utf8")
    expect((await invoke("replies", "edit", "away", "--per-chat", "unlimited")).code).toBe(2)
    expect(readFileSync(file, "utf8")).toBe(before)
    expect(never).not.toHaveBeenCalled()
  })

  it("drives every audience option, with stderr warnings, from a new file that answers nobody", async () => {
    const { invoke, file, never } = setup()
    await invoke("replies", "add", "away")
    expect(JSON.parse(readFileSync(file, "utf8")).audience).toMatchObject({ reply: "listed", allow: { people: [] } })
    const result = await invoke(
      "replies",
      "audience",
      "--reply",
      "listed",
      "--allow-people",
      "11",
      "--allow-chats",
      "20",
      "--deny-people",
      "11",
      "--deny-chats",
      "21",
    )
    expect(result.code).toBe(0)
    expect(JSON.parse(result.data)).toEqual({
      reply: "listed",
      allow: { people: ["11"], chats: ["20"] },
      deny: { people: ["11"], chats: ["21"] },
    })
    expect(result.diagnostics).toContain("deny wins")
    expect(JSON.parse(readFileSync(file, "utf8"))).not.toHaveProperty("testers")
    expect(
      (
        await invoke(
          "replies",
          "audience",
          "--allow-people",
          "",
          "--allow-chats",
          "",
          "--deny-people",
          "",
          "--deny-chats",
          "",
        )
      ).code,
    ).toBe(0)
    expect((await invoke("replies", "audience", "--reply", "all")).code).toBe(0)
    expect(never).not.toHaveBeenCalled()
  })

  it("edits purpose settings and reports field sources, then grants, denies, allows and revokes consent", async () => {
    const { invoke, never } = setup()
    for (const [field, value] of [
      ["provider", "openai"],
      ["model", "test-model"],
      ["baseUrl", "https://example.test/v1"],
    ] as const) {
      expect((await invoke("config", "set", `models.replies.${field}`, value)).code).toBe(0)
    }
    const shown = await invoke("config", "show")
    const models = JSON.parse(shown.data).settings.find((row: { setting: string }) => row.setting === "models")
    expect(models.value.replies).toEqual({
      provider: "openai",
      model: "test-model",
      baseUrl: "https://example.test/v1",
    })
    expect(models.sources["models.replies.provider"]).toContain("config file")
    expect((await invoke("replies", "consents", "grant")).code).toBe(0)
    expect(JSON.parse((await invoke("replies", "consents", "deny", "900719925474099399")).data).deniedChats).toEqual([
      "900719925474099399",
    ])
    expect(JSON.parse((await invoke("replies", "consents", "allow", "900719925474099399")).data).deniedChats).toEqual(
      [],
    )
    expect(JSON.parse((await invoke("replies", "consents", "show")).data).provider).toBe(
      "openai:https://example.test/v1",
    )
    expect((await invoke("replies", "consents", "revoke")).code).toBe(0)
    expect(JSON.parse((await invoke("replies", "consents", "show")).data).provider).toBeNull()
    for (const field of ["provider", "model", "baseUrl"])
      expect((await invoke("config", "unset", `models.replies.${field}`)).code).toBe(0)
    expect((await invoke("replies", "consents", "grant")).code).not.toBe(0)
    expect(never).not.toHaveBeenCalled()
  })

  it("previews instructions and fallback, and only --ai with consent calls a model on stored data", async () => {
    const { invoke, file, env, app, provider, never } = setup()
    rememberAccount(app, "default", "500", env)
    const store = await openStore({ env })
    const account = { provider, account: "500" }
    const at = new Date(Date.now() - 1000).toISOString()
    await store.saveChats(account, [
      { id: "11", title: "Test chat", kind: "dialog", unreadCount: 0, lastMessageAt: at, participantsCount: null },
    ])
    await store.saveMessages(
      account,
      "11",
      [
        {
          id: "1",
          chatId: "11",
          senderId: "11",
          senderName: "Ana",
          text: "Synthetic incoming data",
          timestamp: at,
          editedAt: null,
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "test" },
    )
    await store.close()
    const taskCounts = await invoke("stats", "tasks", "show", "--chat", "11", "--type", "request")
    expect(taskCounts.code).toBe(0)
    expect(JSON.parse(taskCounts.data).items).toEqual([])
    await invoke("replies", "add", "away")
    await invoke(
      "replies",
      "edit",
      "away",
      "--template",
      "{% ai %}Greet {{ sender.firstName }}{% else %}Later{% endai %}",
    )
    const raw = JSON.parse(readFileSync(file, "utf8"))
    raw.audience = { reply: "listed", allow: { people: ["11"], chats: [] }, deny: { people: [], chats: [] } }
    writeFileSync(file, JSON.stringify(raw))
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: "Hello Ana" } }],
            usage: { total_tokens: 3 },
          }),
        ),
    )
    vi.stubGlobal("fetch", fetcher)
    const preview = await invoke("replies", "test", "--since-time", "1d")
    expect(preview.code).toBe(0)
    expect(JSON.parse(preview.data).rules[0].would[0]).toMatchObject({
      text: "Later",
      blocks: [{ instruction: "Greet Ana", fallback: "Later" }],
    })
    expect(fetcher).not.toHaveBeenCalled()
    const disabled = await invoke("replies", "test", "--ai")
    expect(disabled.code).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
    for (const [field, value] of [
      ["provider", "openai"],
      ["model", "test-model"],
      ["baseUrl", "https://example.test/v1"],
    ] as const)
      await invoke("config", "set", `models.replies.${field}`, value)
    await invoke("replies", "consents", "grant")
    const modeled = await invoke("replies", "test", "--ai")
    expect(modeled.code).toBe(0)
    expect(JSON.parse(modeled.data).rules[0].would[0].text).toBe("Hello Ana")
    expect(fetcher).toHaveBeenCalledTimes(1)
    await invoke("config", "set", "permissions.messages", "deny")
    expect((await invoke("replies", "test", "--ai")).code).not.toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(never).not.toHaveBeenCalled()
  })
})
