import { existsSync } from "node:fs"
import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { listRuns, runsDirFor } from "@leemour/cli-messaging/cli"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_APP } from "./app.js"
import type { Environment } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { commandWords, liftProfile } from "./profile.js"
import { createProgram, run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { SessionStore } from "./session/store.js"
import { type MockMaxOptions, mockMax, pagedHistory } from "./testing/mock-max.js"

/** A MAX that answers a login and one history read, and a keyring that holds a token or not. */
const scriptedMax = ({ token = true } = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [{ id: 111, title: "First", type: "CHAT", lastEventTime: 1789776000000 }],
      },
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHAT_HISTORY]: pagedHistory([
        { id: 116762160362694583n, time: 1789776000000, sender: 10000002, text: "hi", attaches: [] },
      ]),
      // The sender is in no chat the login named, so naming them costs this request — a group
      // member is looked up now, not only the other half of a dialog. Left unscripted it does not
      // fail: the client waits, gives up and says "shown by id" on stderr, which is correct of it
      // and looks like a broken assertion from here.
      [Opcode.CONTACT_INFO]: {
        contacts: [{ id: 10000002, names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
    },
  })
  const keyring = memoryKeyring()
  return {
    max,
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      if (token) store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
}

/**
 * A login that carries a `time`, so the store takes its memberships, and a group and a dialog to
 * look into. Each test names its own profile: they share one sandboxed cache directory.
 */
const acquaintedMax = (extra: MockMaxOptions["answers"] = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        time: 1789776000000,
        profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "FULL_NAME" }] } },
        chats: [
          {
            id: 111,
            title: "First",
            type: "CHAT",
            newMessages: 2,
            participantsCount: 3,
            lastEventTime: 1789776000000,
            participants: { 10000001: 1, 10000002: 1, 10000003: 1 },
          },
          {
            id: 222,
            type: "DIALOG",
            newMessages: 0,
            lastEventTime: 1789775000000,
            participants: { 10000001: 1, 10000002: 1 },
          },
        ],
        contacts: [{ id: 10000002, link: "someone", names: [{ name: "Someone Else", type: "FULL_NAME" }] }],
      },
      [Opcode.CONTACT_INFO]: { contacts: [{ id: 10000003, names: [{ name: "Another Person", type: "FULL_NAME" }] }] },
      // As MAX answers a forward read: starting with the message it was given, whose id holds its time.
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.CHAT_HISTORY]: {
        messages: [
          { id: 116762160362694583n, time: 1781649175456, sender: 10000002, text: "anchor", attaches: [] },
          { id: 116762160362694584n, time: 1781649175457, sender: 10000002, text: "later", attaches: [] },
          { id: 116762160362694585n, time: 1781649175458, sender: 10000002, text: "latest", attaches: [] },
        ],
      },
      ...extra,
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      // As `session start` leaves a profile: the token, and the account it logged in as.
      store.writeToken("a-token")
      if (!store.readState().viewerId) store.writeState({ ...store.readState(), viewerId: "10000001" })
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  return { max, environment }
}

const runWith = async (argv: string[], environment: Environment = {}) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

describe("the program", () => {
  it("refuses a topic read without marking the whole chat read", async () => {
    const { max, ...environment } = scriptedMax()
    const result = await runWith(["chats", "mark-read", "111", "--topic", "12", "--json"], environment)
    expect(result.code).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("mark a forum topic read")
    expect(max.sent.some(({ opcode }) => opcode === Opcode.CHAT_MARK)).toBe(false)
  })

  it("refuses --topic for shared message and poll commands without sending", async () => {
    const { max, ...environment } = scriptedMax()
    const sent = await runWith(["messages", "send", "111", "hi", "--topic", "12", "--json"], environment)
    const poll = await runWith(
      ["polls", "create", "111", "Friday?", "yes", "no", "--topic", "12", "--json"],
      environment,
    )
    for (const result of [sent, poll]) {
      expect(result.code).toBe(2)
      expect(result.stdout).toBe("")
      expect(JSON.parse(result.stderr).error).toMatchObject({
        code: "validation_error",
        message: "this messenger cannot send to a forum topic",
      })
    }
    expect(max.sent.filter(({ opcode }) => opcode === Opcode.MSG_SEND)).toEqual([])
  })

  it("shows a control character from the command line in an error, instead of passing it to the terminal", async () => {
    const streams = captureStreams()
    const code = await run(["config", "set", "limit", "x\u001b[2Ky"], { streams, tty: true })

    expect(code).toBe(2)
    expect(streams.stderr.join("")).toContain("x\\x1b[2Ky")
    expect(streams.stderr.join("")).not.toContain("\u001b")
  })

  it("prints a version, and prints it on stdout", async () => {
    const { stdout, stderr, code } = await runWith(["--version"])
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
    expect(stderr).toBe("")
    expect(code).toBe(0)
  })

  it("is called max, whatever the package is called", async () => {
    expect((await runWith(["--help"])).stdout).toContain("Usage: max")
  })

  it("offers every resource at the top level", async () => {
    const { stdout } = await runWith(["--help"])
    for (const command of ["session", "account", "chats", "contacts", "messages", "store", "runs"]) {
      expect(stdout).toContain(command)
    }
  })

  it("offers offline reads and cleanup of departed chats", async () => {
    expect((await runWith(["--help"])).stdout).toContain("--offline")
    expect((await runWith(["store", "--help"])).stdout).toContain("clear")
  })

  it("**does not offer --no-cache**, because not using the record is already what happens", async () => {
    expect((await runWith(["--help"])).stdout).not.toContain("--no-cache")
  })

  it("reads --offline as a switch the commands can see", () => {
    const program = createProgram()
    program.parseOptions(["--offline"])
    expect(program.opts().offline).toBe(true)

    const untouched = createProgram()
    untouched.parseOptions([])
    expect(untouched.opts().offline).toBeUndefined()
  })

  it("reads a run back three ways, and records nothing while doing it", async () => {
    const { stdout } = await runWith(["runs", "--help"])
    for (const action of ["list", "show", "path"]) expect(stdout).toContain(action)
  })

  it("**tells `--record`, `--no-record` and neither apart**, because the third is the configuration's", () => {
    const asked = createProgram()
    asked.parseOptions(["--record"])
    expect(asked.opts().record).toBe(true)

    const refused = createProgram()
    refused.parseOptions(["--no-record"])
    expect(refused.opts().record).toBe(false)

    // Not `true` and not `false`: nothing on the command line means the configuration file decides,
    // and a default here would quietly outrank it.
    const untouched = createProgram()
    untouched.parseOptions([])
    expect(untouched.opts().record).toBeUndefined()
  })

  it("promises only what `--trace` actually does", async () => {
    // `commander` wraps the column, so the promise is checked in the piece that survives wrapping.
    const { stdout } = await runWith(["--help"])
    expect(stdout).toContain("ids and timings")
    // It said "without anything that identifies you" until 2026-09-20, and the line names the chat.
    expect(stdout).not.toContain("without anything that identifies you")
  })

  it("**puts the action under the resource, never beside it**", async () => {
    const messages = await runWith(["messages", "--help"])
    expect(messages.stdout).toContain("list")
    expect(messages.stdout).toContain("send")

    // `max send` was a top-level command until 2026-09-19. One rule, no exceptions to remember.
    const gone = await runWith(["send", "0", "hello"])
    expect(gone.stderr).toContain("unknown command")
    expect(gone.code).not.toBe(0)
  })

  it("keeps no alias for a renamed command: the old name fails and sends nothing", async () => {
    const { max, ...environment } = scriptedMax()
    const renamed = [
      ["backup", "messages", "111", "--last", "5", "--run"],
      ["export", "messages", "111", "--format", "md"],
      ["update", "--check"],
      ["chats", "read", "111"],
      ["chats", "settings", "111"],
      ["recipients", "off"],
      ["account", "sessions", "end-others", "--yes"],
      ["messages", "send", "111", "hello", "--cid", "5"],
      ["messages", "forward", "111", "116762160362694583", "--to", "111", "--cid", "5"],
      ["bot", "recipients", "off"],
    ]

    for (const argv of renamed) {
      const { code, stdout, stderr } = await runWith([...argv, "--json"], environment)
      expect({ argv, code, stdout }).toEqual({ argv, code: 1, stdout: "" })
      expect(stderr).toMatch(/unknown (command|option)/)
    }
    expect(max.sent).toEqual([])
  })

  it("keeps a subcommand from killing the process on a bad option", async () => {
    const { stdout, stderr, code } = await runWith(["chats", "list", "--nonsense"])
    expect(stdout).toBe("")
    expect(stderr).toContain("unknown option")
    expect(code).not.toBe(0)
  })

  it("counts -v, gives the version to -V, and turns -vv into the second level", async () => {
    expect((await runWith(["-V"])).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
    expect(resolveSettings({ verbose: 2 }, { env: {} }).detail).toBe(2)
    expect(resolveSettings({ verbose: 5 }, { env: {} }).detail).toBe(2)

    const program = createProgram()
    program.parseOptions(["-vv"])
    expect(program.opts().verbose).toBe(2)
  })

  it("carries the global options every command needs", async () => {
    const { stdout } = await runWith(["--help"])
    for (const option of ["--json", "--jsonl", "--quiet", "--verbose", "--trace"]) expect(stdout).toContain(option)
  })

  it("**has no `--profile`, and says in its help where the profile went**", async () => {
    const { stdout } = await runWith(["--help"])
    expect(stdout).not.toContain("--profile")
    expect(stdout).toContain("max [profile]")
    expect(stdout).toContain("The first word is the profile")
    expect(stdout).toContain("MAX_PROFILE")
  })

  it("offers `--silent` on a send and nowhere else", async () => {
    const send = await runWith(["messages", "send", "--help"])
    expect(send.stdout).toContain("--silent")

    // Reading is observational; there is nothing to notify anybody about, and a flag that does
    // nothing on half the commands is a flag people learn to distrust.
    const list = await runWith(["messages", "list", "--help"])
    expect(list.stdout).not.toContain("--silent")
  })

  it("**refuses a search shorter than the index can answer**, instead of printing an empty list", async () => {
    // A trigram index returns nothing for one or two characters rather than complaining, and an
    // empty list is indistinguishable from "no matches". Measured 2026-09-22.
    const { code, stderr } = await runWith(["chats", "list", "--search", "ив"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("3 characters")
  })

  it("refuses an unknown --kind by name, rather than answering with nothing", async () => {
    const { code, stderr } = await runWith(["chats", "list", "--kind", "chanel"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("dialog, group, channel")
  })

  it("offers searching as an action under `messages`, with the same shape as the rest", async () => {
    const { stdout } = await runWith(["messages", "--help"])
    expect(stdout).toContain("search")

    const search = await runWith(["messages", "search", "--help"])
    expect(search.stdout).toContain("--chat")
    expect(search.stdout).toContain("local store")
  })

  it("`messages search --regex` tests one pattern against what the store holds", async () => {
    const { environment } = acquaintedMax()
    await runWith(["t-regex", "messages", "list", "111", "--json"], environment)

    const found = await runWith(["t-regex", "messages", "search", "^lat", "--regex", "--json"], environment)

    expect(found.code).toBe(0)
    expect(
      JSON.parse(found.stdout)
        .items.map((hit: { text: string }) => hit.text)
        .sort(),
    ).toEqual(["later", "latest"])
  })

  it("**finds a chat for a search by its stored name**, without connecting", async () => {
    const { max, environment } = acquaintedMax()
    await runWith(["t-search-name", "messages", "list", "111", "--json"], environment)
    const sent = max.sent.length

    const found = await runWith(
      ["t-search-name", "messages", "search", "latest", "--chat", "First", "--json"],
      environment,
    )

    expect(found.code).toBe(0)
    expect(JSON.parse(found.stdout).items.map((hit: { chatId: string }) => hit.chatId)).toEqual(["111"])
    expect(max.sent).toHaveLength(sent)
  })

  it("**refuses `--timeout` without a unit**, because the neighbouring setting is milliseconds", async () => {
    const { code, stderr } = await runWith(["--timeout", "30", "chats", "list"])
    expect(code).not.toBe(0)
    expect(stderr).toContain("30s, 2m or 500ms")
  })

  it("offers --timeout at the top level, where every command can be given one", async () => {
    const { stdout } = await runWith(["--help"])
    expect(stdout).toContain("--timeout <duration>")
    expect(stdout).toContain("whole command")
  })

  it("offers `config show`, so the settings in force can be read without guessing", async () => {
    const { stdout } = await runWith(["--help"])
    expect(stdout).toContain("config")

    const show = await runWith(["config", "--help"])
    expect(show.stdout).toContain("show")
    expect(show.stdout).toContain("where each one came from")
  })

  describe("what a command prints", () => {
    it("`config show --json` answers one object on stdout", async () => {
      const { stdout, code } = await runWith(["config", "show", "--json"])
      expect(code).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ profile: "default", configFound: false })
    })

    it("`config show` includes the speech model", async () => {
      const { stdout } = await runWith(["config", "show", "--json"])
      expect(JSON.parse(stdout).settings.map((row: { setting: string }) => row.setting)).toContain("transcribeModel")
    })

    it("`config set` saves a setting that `config show` then reports from the file", async () => {
      const set = await runWith(["work", "config", "set", "limit", "30", "--json"])
      expect(set.code).toBe(0)
      expect(JSON.parse(set.stdout)).toMatchObject({ scope: "profiles.work", setting: "limit", value: 30 })

      const { stdout } = await runWith(["work", "config", "show", "--json"])
      expect(JSON.parse(stdout).settings).toContainEqual({
        setting: "limit",
        value: 30,
        from: "config file: profiles.work",
      })

      await runWith(["work", "config", "unset", "limit"])
      const after = await runWith(["work", "config", "show", "--json"])
      expect(JSON.parse(after.stdout).settings).toContainEqual({ setting: "limit", value: 20, from: "default" })
    })

    it("`config set --bot` writes the bot side, and `config show --bot` reads it back", async () => {
      const set = await runWith(["test", "config", "set", "--bot", "sendsPerHour", "60", "--json"])
      expect(JSON.parse(set.stdout)).toMatchObject({ scope: "bot.profiles.test", value: 60 })

      const bot = JSON.parse((await runWith(["test", "config", "show", "--bot", "--json"])).stdout)
      expect(bot.kind).toBe("bot")
      expect(bot.settings.map((row: { setting: string }) => row.setting)).not.toContain("serve")
      expect(bot.settings).toContainEqual({
        setting: "sendsPerHour",
        value: 60,
        from: "config file: bot.profiles.test",
      })
      const personal = JSON.parse((await runWith(["test", "config", "show", "--json"])).stdout)
      expect(personal.settings).toContainEqual({ setting: "sendsPerHour", value: 30, from: "default" })
    })

    it("`config set --personal` writes the personal section, which a bot on the same profile does not read", async () => {
      const set = await runWith(["t-side", "config", "set", "--personal", "limit", "40", "--json"])
      expect(JSON.parse(set.stdout)).toMatchObject({ scope: "personal.profiles.t-side", value: 40 })

      const limitOf = async (argv: string[]) =>
        JSON.parse((await runWith(["t-side", "config", "show", ...argv, "--json"])).stdout).settings.find(
          (row: { setting: string }) => row.setting === "limit",
        )
      expect(await limitOf([])).toEqual({ setting: "limit", value: 40, from: "config file: personal.profiles.t-side" })
      expect(await limitOf(["--bot"])).toMatchObject({ value: 20, from: "default" })
    })

    it("`config unset --personal` and `--bot` each remove only their own section's value", async () => {
      await runWith(["t-unset", "config", "set", "--personal", "sendsPerHour", "10"])
      await runWith(["t-unset", "config", "set", "--bot", "sendsPerHour", "50"])
      const sendsPerHour = async (argv: string[]) =>
        JSON.parse((await runWith(["t-unset", "config", "show", ...argv, "--json"])).stdout).settings.find(
          (row: { setting: string }) => row.setting === "sendsPerHour",
        ).from

      const unset = await runWith(["t-unset", "config", "unset", "--personal", "sendsPerHour", "--json"])
      expect(JSON.parse(unset.stdout)).toMatchObject({ scope: "personal.profiles.t-unset", value: null })
      expect(await sendsPerHour([])).toBe("default")
      expect(await sendsPerHour(["--bot"])).toBe("config file: bot.profiles.t-unset")

      await runWith(["t-unset", "config", "unset", "--bot", "sendsPerHour"])
      expect(await sendsPerHour(["--bot"])).toBe("default")
    })

    it("`--serve` and `--no-serve` decide the serve setting for this command, over the file", async () => {
      await runWith(["t-serve", "config", "set", "serve", "false"])
      const serveOf = async (flag: string) =>
        JSON.parse((await runWith(["t-serve", flag, "config", "show", "--json"])).stdout).settings.find(
          (row: { setting: string }) => row.setting === "serve",
        )

      expect(await serveOf("--serve")).toEqual({ setting: "serve", value: true, from: "flag" })
      await runWith(["t-serve", "config", "set", "serve", "true"])
      expect(await serveOf("--no-serve")).toEqual({ setting: "serve", value: false, from: "flag" })
    })

    it("`config set defaultProfile` picks the profile a bare `max` uses", async () => {
      await runWith(["config", "set", "defaultProfile", "mila"])
      const shown = JSON.parse((await runWith(["config", "show", "--json"])).stdout)
      expect(shown).toMatchObject({ profile: "mila", profileFrom: "config file: defaultProfile" })
      await runWith(["config", "unset", "defaultProfile"])
    })

    it("`skill show` prints the skill file itself", async () => {
      const { stdout } = await runWith(["skill", "show"])
      expect(stdout.startsWith("---\nname: max-cli")).toBe(true)
    })

    it("`messages list` reads a scripted MAX and answers the listing, and marks nothing read", async () => {
      const { max, ...environment } = scriptedMax()
      const { stdout, stderr, code } = await runWith(["messages", "list", "111", "--limit", "5", "--json"], environment)

      // ⚠ **First, so the failure names its cause.** This test went red when sender naming began
      // asking `CONTACT_INFO` that nothing scripted; the mock stayed silent, the client waited,
      // gave up and said "shown by id" — and what failed was the `stderr` line below, which
      // reports a symptom three steps downstream. Asserted here, the message is the opcode.
      expect(max.unexpected).toEqual([])

      expect(stderr).toBe("")
      expect(code).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({
        items: [{ id: "116762160362694583", text: "hi", senderName: "Someone Else" }],
        hasMore: false,
      })
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    })

    it("`--jsonl` writes one object per line and nothing else", async () => {
      const { max: _, ...environment } = scriptedMax()
      const { stdout } = await runWith(["messages", "list", "111", "--jsonl"], environment)
      expect(stdout.split("\n").map((line) => JSON.parse(line).id)).toEqual(["116762160362694583"])
    })

    it("**leaves stdout empty on a failure** — no session, nothing printed but the error", async () => {
      const { max: _, ...environment } = scriptedMax({ token: false })
      const { stdout, stderr, code } = await runWith(["account", "show", "--json"], environment)
      expect(stdout).toBe("")
      expect(JSON.parse(stderr).error.code).toBe("authentication_error")
      expect(code).toBe(4)
    })
  })

  describe("session start", () => {
    afterEach(() => vi.unstubAllEnvs())

    it("mentions the MAX terms after a profile's first login, and not after the next", async () => {
      vi.stubEnv("MAX_TOKEN", "a-token")
      const { max, ...environment } = scriptedMax({ token: false })

      const first = await runWith(["t-terms", "session", "start"], environment)
      const second = await runWith(["t-terms", "session", "start"], environment)

      expect(max.unexpected).toEqual([])
      expect(first.code).toBe(0)
      expect(first.stderr).toContain("MAX terms")
      expect(second.code).toBe(0)
      expect(second.stderr).not.toContain("MAX terms")
    })
  })

  describe("reading without sending anything", () => {
    it("`chats list --unread` answers only the chats with something unread", async () => {
      const { max, environment } = acquaintedMax()
      const { stdout, code } = await runWith(["t-unread", "chats", "list", "--unread", "--json"], environment)

      expect(max.unexpected).toEqual([])
      expect(code).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ items: [{ id: "111", unreadCount: 2 }], hasMore: false })
    })

    it("`chats list` pages by `--limit` and `--page`, and `--all` ignores the limit", async () => {
      const { environment } = acquaintedMax()
      const idsOf = async (argv: string[]) => {
        const { stdout } = await runWith(["t-pages", "chats", "list", ...argv, "--json"], environment)
        const { items, hasMore } = JSON.parse(stdout)
        return { ids: items.map((chat: { id: string }) => chat.id), hasMore }
      }

      expect(await idsOf(["--limit", "1"])).toEqual({ ids: ["111"], hasMore: true })
      expect(await idsOf(["--limit", "1", "--page", "2"])).toEqual({ ids: ["222"], hasMore: false })
      expect(await idsOf(["--limit", "1", "--all"])).toEqual({ ids: ["111", "222"], hasMore: false })
    })

    it("`messages show` answers the one message asked for, reading nothing on either side of it", async () => {
      const { max, environment } = acquaintedMax()
      const { stdout, code } = await runWith(
        ["t-msg-show", "messages", "show", "111", "116762160362694583", "--json"],
        environment,
      )

      expect(max.unexpected).toEqual([])
      expect(code).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({ id: "116762160362694583", text: "anchor", anchor: true })
      const history = max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload
      expect(history).toMatchObject({ from: Number(116762160362694583n >> 16n), backward: 1, forward: 0 })
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    })

    it("`messages context` asks for `--before-n` and `--after-n` around the message and marks which one it is", async () => {
      const { max, environment } = acquaintedMax()
      const { stdout, code } = await runWith(
        [
          "t-msg-context",
          "messages",
          "context",
          "111",
          "116762160362694583",
          "--before-n",
          "0",
          "--after-n",
          "2",
          "--json",
        ],
        environment,
      )

      expect(code).toBe(0)
      const history = max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload
      expect(history).toMatchObject({ backward: 1, forward: 2 })
      expect(
        JSON.parse(stdout).items.map((message: { id: string; anchor?: boolean }) => message.anchor ?? false),
      ).toEqual([true, false, false])
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    })

    it("`messages search --limit` caps what the local copy answers and says more matched", async () => {
      const { environment } = acquaintedMax()
      await runWith(["t-search", "messages", "list", "111", "--json"], environment)

      const capped = await runWith(
        [
          "t-search",
          "messages",
          "search",
          "lat*",
          "--language",
          "lucene",
          "--timezone",
          "Europe/Madrid",
          "--limit",
          "1",
          "--json",
        ],
        environment,
      )
      const all = await runWith(["t-search", "messages", "search", "lat*", "--json"], environment)

      expect(JSON.parse(capped.stdout)).toMatchObject({ hasMore: true })
      expect(JSON.parse(capped.stdout).items).toHaveLength(1)
      expect(JSON.parse(all.stdout).items).toHaveLength(2)
      expect(JSON.parse(capped.stdout).query).toMatchObject({ language: "lucene-v1", timezone: "Europe/Madrid" })
      const strict = await runWith(["t-search", "messages", "search", "lat", "--json"], environment)
      const legacy = await runWith(
        ["t-search", "messages", "search", "lat", "--language", "legacy", "--json"],
        environment,
      )
      expect(JSON.parse(strict.stdout).items).toHaveLength(0)
      expect(JSON.parse(legacy.stdout).items).toHaveLength(2)
    })

    it("`messages search --newest` orders hits newest first, and `--context` brings the messages around each", async () => {
      const { environment } = acquaintedMax()
      await runWith(["t-search-order", "messages", "list", "111", "--json"], environment)

      const newest = await runWith(["t-search-order", "messages", "search", "lat*", "--newest", "--json"], environment)
      const around = await runWith(
        ["t-search-order", "messages", "search", "lat*", "--context", "1", "--limit", "1", "--json"],
        environment,
      )

      const times = JSON.parse(newest.stdout).items.map((hit: { timestamp: string }) => hit.timestamp)
      expect(times).toEqual([...times].sort().reverse())
      expect(JSON.parse(around.stdout).items[0].context.length).toBeGreaterThan(0)
      const everywhere = await runWith(
        ["t-search-order", "messages", "search", "lat*", "--source", "all", "--json"],
        environment,
      )
      expect(JSON.parse(everywhere.stdout).items.length).toBeGreaterThan(0)
    })

    it("`--verbose` adds the ids under each message a person reads", async () => {
      const { environment } = acquaintedMax()
      const read = async (argv: string[]) => {
        const streams = captureStreams()
        await run(["t-verbose", ...argv, "messages", "list", "111", "--limit", "1"], {
          ...environment,
          streams,
          tty: true,
        })
        return { stdout: streams.stdout.join("\n") }
      }
      const plain = await read([])
      const verbose = await read(["--verbose"])

      expect(plain.stdout).not.toMatch(/message\s+11676216036269458\d/)
      expect(verbose.stdout).toMatch(/message\s+11676216036269458\d/)
      expect(verbose.stdout).toMatch(/chat\s+111/)
    })

    it("`runs show` and `runs path` read back a recorded run, and the record carries no message text", async () => {
      const { environment } = acquaintedMax()
      await runWith(["t-runs", "messages", "list", "111", "--record", "--json"], environment)
      const { runId } = JSON.parse((await runWith(["t-runs", "runs", "list", "--json"])).stdout).items.find(
        (run: { profile: string }) => run.profile === "t-runs",
      )

      const shown = await runWith(["t-runs", "runs", "show", runId, "--json"])
      const path = await runWith(["t-runs", "runs", "path", runId, "--json"])
      const missing = await runWith(["t-runs", "runs", "show", "no-such-run", "--json"])

      expect(JSON.parse(shown.stdout)).toMatchObject({ command: "messages list", directory: expect.any(String) })
      expect(JSON.parse(shown.stdout).events.length).toBeGreaterThan(0)
      for (const text of ["anchor", "later", "latest"]) expect(shown.stdout).not.toContain(`"${text}"`)
      expect(JSON.parse(path.stdout)).toEqual({ path: JSON.parse(shown.stdout).directory })
      expect(existsSync(JSON.parse(path.stdout).path)).toBe(true)
      expect(missing.code).not.toBe(0)
    })

    it("`messages list --after-id` reads forward from the message, leaves it out, and names the next page", async () => {
      const { max, environment } = acquaintedMax()
      const { stdout, stderr, code } = await runWith(
        ["t-after", "messages", "list", "111", "--after-id", "116762160362694583", "--limit", "1", "--jsonl"],
        environment,
      )

      expect(max.unexpected).toEqual([])
      expect(code).toBe(0)
      expect(JSON.parse(stdout).id).toBe("116762160362694584")
      expect(stderr).toContain("--after-id 116762160362694584")

      const history = max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload
      expect(history).toMatchObject({ from: Number(116762160362694583n >> 16n) + 1, forward: 2, backward: 0 })
      expect(max.sent.map((call) => call.opcode)).not.toContain(Opcode.CHAT_MARK)
    })

    it("`messages list --before-id` leaves out the message it pages from, which MAX's answer includes", async () => {
      const { environment } = acquaintedMax()
      const { stdout, code } = await runWith(
        ["t-before", "messages", "list", "111", "--before-id", "116762160362694585", "--limit", "2", "--json"],
        environment,
      )

      expect(code).toBe(0)
      expect(JSON.parse(stdout).items.map((message: { id: string }) => message.id)).toEqual([
        "116762160362694583",
        "116762160362694584",
      ])
    })

    it("`messages list --before-time` reads back from just before that moment", async () => {
      const { max, environment } = acquaintedMax()
      const { code } = await runWith(
        ["t-before-time", "messages", "list", "111", "--before-time", "2026-09-21T00:00:00Z", "--limit", "2", "--json"],
        environment,
      )

      expect(code).toBe(0)
      const history = max.sent.find((call) => call.opcode === Opcode.CHAT_HISTORY)?.payload
      expect(history).toMatchObject({ from: Date.parse("2026-09-21T00:00:00Z") - 1, backward: 2, forward: 0 })
    })

    it("**refuses `--after-time` with `--before-time`** before connecting to anything", async () => {
      const { max, environment } = acquaintedMax()
      const { code, stderr } = await runWith(
        [
          "t-both",
          "messages",
          "list",
          "111",
          "--after-time",
          "2026-09-20T00:00:00Z",
          "--before-time",
          "2026-09-21T00:00:00Z",
        ],
        environment,
      )

      expect(code).toBe(2)
      expect(stderr).toContain("two starting points")
      expect(max.sent).toEqual([])
    })

    it("blames `--after-time` for a value that is not a time", async () => {
      const { environment } = acquaintedMax()
      const { code, stderr } = await runWith(
        ["t-bad", "messages", "list", "111", "--after-time", "tuesday"],
        environment,
      )

      expect(code).toBe(2)
      expect(stderr).toContain("--after-time takes")
    })

    it("`chats show` answers one chat with its members, and refuses an id that is not a chat", async () => {
      const { max, environment } = acquaintedMax()
      const shown = await runWith(["t-show", "chats", "show", "First", "--json"], environment)

      expect(max.unexpected).toEqual([])
      expect(shown.code).toBe(0)
      expect(JSON.parse(shown.stdout)).toMatchObject({
        id: "111",
        kind: "group",
        unreadCount: 2,
        participantsCount: 3,
        members: [{ name: "Another Person" }, { name: "Someone Else", username: "someone" }],
      })
      expect(shown.stderr).toContain("2 listed members; the chat reports 3 participants")
      expect(shown.stderr).toContain("may omit your account or be partial")

      const missing = await runWith(["t-show", "chats", "show", "999", "--json"], environment)
      expect(JSON.parse(missing.stderr).error.code).toBe("not_found")
      expect(missing.stdout).toBe("")
    })

    it("`contacts profile` adds when MAX says they registered, their photo, and their stored activity per chat", async () => {
      const { max, environment } = acquaintedMax({
        [Opcode.CONTACT_INFO]: {
          contacts: [
            {
              id: 10000002,
              names: [{ name: "Someone Else", type: "FULL_NAME" }],
              link: "someone",
              registrationTime: 1600000000000,
              photoId: 77,
              phone: "0123",
            },
            { id: 10000003, names: [{ name: "Another Person", type: "FULL_NAME" }] },
          ],
        },
      })
      const shown = await runWith(["t-profile", "contacts", "profile", "@someone", "--json"], environment)

      expect(max.unexpected).toEqual([])
      expect(shown.code).toBe(0)
      const profile = JSON.parse(shown.stdout)
      expect(profile).toMatchObject({
        id: "10000002",
        usernames: ["someone"],
        registered: { at: "2020-09-13T12:26:40.000Z", source: "max", precision: "day" },
        hasPhoto: true,
        flags: {},
      })
      expect(profile.chats.map((one: { id: string; kind: string }) => [one.id, one.kind])).toEqual([
        ["111", "group"],
        ["222", "dialog"],
      ])
      expect(profile.chats[0]).toHaveProperty("theirMessages")
      expect(profile.phone).toBe("***0123")
      const whole = await runWith(
        ["t-profile", "contacts", "profile", "@someone", "--show-phone", "--json"],
        environment,
      )
      expect(JSON.parse(whole.stdout).phone).toBe("0123")
    })

    it("`contacts show` finds a person by @username, with every chat shared, and refuses an ambiguous name", async () => {
      const { max, environment } = acquaintedMax()
      const shown = await runWith(["t-person", "contacts", "show", "@someone", "--json"], environment)

      expect(max.unexpected).toEqual([])
      expect(shown.code).toBe(0)
      expect(JSON.parse(shown.stdout)).toMatchObject({
        id: "10000002",
        name: "Someone Else",
        chats: [
          { id: "111", kind: "group" },
          { id: "222", kind: "dialog" },
        ],
      })

      const group = await runWith(["t-person", "contacts", "show", "another", "--json"], environment)
      expect(JSON.parse(group.stdout)).toMatchObject({ id: "10000003", chats: [{ id: "111" }] })

      const ambiguous = await runWith(["t-person", "contacts", "show", "on", "--json"], environment)
      expect(ambiguous.code).toBe(2)
      expect(JSON.parse(ambiguous.stderr).error.candidates).toHaveLength(2)
    })

    it("**`--offline` reaches the command**: it answers from the record and never connects", async () => {
      const { environment } = acquaintedMax()
      await runWith(["t-offline", "chats", "list", "--json"], environment)

      const silent = acquaintedMax()
      const offline = await runWith(["t-offline", "chats", "show", "First", "--offline", "--json"], silent.environment)
      expect(offline.code).toBe(0)
      expect(JSON.parse(offline.stdout)).toMatchObject({
        id: "111",
        participantsCount: 3,
        members: [
          { id: "10000003", name: "Another Person" },
          { id: "10000002", name: "Someone Else" },
        ],
      })
      expect(offline.stderr).toContain("2 listed members; the chat reports 3 participants")
      expect(offline.stderr).toContain("may omit your account or be partial")

      const send = await runWith(["t-offline", "messages", "send", "111", "hi", "--offline"], silent.environment)
      expect(send.code).not.toBe(0)
      expect(silent.max.sent).toEqual([])
    })
  })

  it("does not mistake a command for a profile", () => {
    const program = createProgram()
    expect(liftProfile(["chats", "list"], commandWords(program)).profile).toBeUndefined()
    expect(liftProfile(["personal", "chats", "list"], commandWords(program)).profile).toBe("personal")
  })

  it("sends an unknown option to stderr and exits non-zero", async () => {
    const { stdout, stderr, code } = await runWith(["--nonsense"])
    expect(stdout).toBe("")
    expect(stderr).toContain("unknown option")
    expect(code).not.toBe(0)
  })

  it("**puts a failure on stderr as JSON, never on stdout**", async () => {
    const { stdout, stderr, code } = await runWith(["a-profile-that-does-not-exist", "account", "show", "--json"])

    expect(stdout).toBe("")
    expect(JSON.parse(stderr).error.code).toBe("authentication_error")
    // 4 is authentication_error in cli-core's table: a script branches on this, not on the text.
    expect(code).toBe(4)
  })

  it("tells a person what to do next, **naming the profile they actually typed**", async () => {
    const streams = captureStreams()
    const code = await run(["a-profile-that-does-not-exist", "account", "show"], { streams, tty: true })

    expect(streams.stdout).toEqual([])
    expect(streams.stderr.join("")).toContain("max a-profile-that-does-not-exist setup")
    expect(code).toBe(4)
  })

  it("**refuses a profile with no command instead of printing help on stdout**", async () => {
    // `max me` — renamed away on 2026-09-19 — is now the profile `me` and nothing else. Commander
    // answers a missing command with help on stdout, which a script cannot tell from a result.
    const { stdout, stderr, code } = await runWith(["me"])

    expect(stdout).toBe("")
    expect(JSON.parse(stderr).error.code).toBe("validation_error")
    expect(JSON.parse(stderr).error.message).toContain("read as a profile name")
    expect(code).toBe(2)
  })

  it("explains itself when the first word was a mistyped command", async () => {
    // `max chat list` — one letter short. Without this line the only message is "unknown command
    // 'list'", which names the wrong word entirely.
    const { stderr, code } = await runWith(["chat", "list"])

    expect(stderr).toContain("unknown command 'list'")
    expect(stderr).toContain('"chat" is not a command, so it was read as a profile name')
    expect(code).not.toBe(0)
  })

  it("does not blame the profile when the word after it is a command", async () => {
    const { stderr, code } = await runWith(["work", "bot", "auth", "status"])

    expect(stderr).toContain("unknown command 'status'")
    expect(stderr).not.toContain("read as a profile name")
    expect(code).not.toBe(0)
  })
})

describe("shared runner adoption", () => {
  it("preserves separate bot and personal failed-run retention before an action begins", async () => {
    const profile = "t-shell-scope"
    expect((await runWith([profile, "config", "set", "--personal", "record", "true", "--json"])).code).toBe(0)
    expect((await runWith([profile, "config", "set", "--bot", "record", "false", "--json"])).code).toBe(0)
    const runsDir = runsDirFor(MAX_APP)
    const before = new Set(listRuns(runsDir).map((item) => item.runId))
    const bot = await runWith([profile, "--timeout", "1s", "--quiet", "bot", "auth", "missing"])
    const personal = await runWith([profile, "--quiet", "account", "missing"])
    expect(bot.code).not.toBe(0)
    expect(personal.code).not.toBe(0)
    expect(bot.stdout).toBe("")
    expect(personal.stdout).toBe("")
    const added = listRuns(runsDir).filter((item) => !before.has(item.runId))
    expect(added).toEqual([expect.objectContaining({ profile, command: "account", status: "failed" })])
  })

  it("uses the configured default profile for a failure before context creation", async () => {
    const profile = "t-shell-default"
    vi.stubEnv("MAX_PROFILE", profile)
    try {
      const before = new Set(listRuns(runsDirFor(MAX_APP)).map((item) => item.runId))
      const result = await runWith(["messages", "list", "--nonsense"])
      expect(result.code).not.toBe(0)
      expect(result.stdout).toBe("")
      const added = listRuns(runsDirFor(MAX_APP)).filter((item) => !before.has(item.runId))
      expect(added).toEqual([
        expect.objectContaining({ profile, command: "messages list", errorCode: "validation_error" }),
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
