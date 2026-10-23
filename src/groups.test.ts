import { captureStreams, memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { RecipientList, SendJournal } from "@wirecat/cli-core/sends"
import { describe, expect, it } from "vitest"
import { MAX_APP } from "./app.js"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { recipientsPathFor, sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const GROUP = {
  id: -70000000000001,
  title: "Team",
  type: "CHAT",
  access: "PRIVATE",
  link: "https://max.ru/join/abcdef",
  participantsCount: 2,
  options: { ALL_CAN_PIN_MESSAGE: true, ONLY_ADMIN_CAN_ADD_MEMBER: false, OFFICIAL: false },
}

const messenger = (
  answers: Record<number, Payload | ((request: Payload) => Payload | undefined)> = {},
  refuse: Record<number, string | ((request: Payload) => string | undefined)> = {},
) => {
  const max = mockMax({
    refuse,
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [GROUP, { id: 222, title: "Strangers", type: "CHAT" }],
      },
      [Opcode.MSG_SEND]: { chat: GROUP, chatId: GROUP.id, message: { id: 1n, time: 1789776000000 } },
      [Opcode.CHAT_JOIN]: { chat: GROUP },
      [Opcode.LINK_INFO]: { chat: GROUP },
      [Opcode.CHAT_LEAVE]: { message: {} },
      [Opcode.CHAT_UPDATE]: { chat: GROUP },
      [Opcode.CHAT_MEMBERS_UPDATE]: { chat: GROUP },
      [Opcode.CHAT_MEMBERS]: {
        members: [{ contact: { id: 30000003, names: [{ name: "Asker", type: "FULL_NAME" }] } }],
      },
      ...answers,
    },
  })
  const keyring = memoryKeyring()
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      store.writeToken("a-token")
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
  }
  const sent = (opcode: number) => max.sent.filter((request) => request.opcode === opcode).map((call) => call.payload)
  return { max, environment, sent }
}

const runWith = async (argv: string[], environment: Environment = {}) => {
  const streams = captureStreams()
  const code = await run(argv, { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

// A profile with no saved account id logs in at connect; past that, nothing may reach MAX.
const sentOnlyLogin = (sent: { opcode: number }[]) =>
  sent.every(({ opcode }) => opcode === Opcode.SESSION_INIT || opcode === Opcode.LOGIN)

const journalOf = (profile: string) => new SendJournal(sendsPathFor(profile)).entries()

describe("joining and leaving", () => {
  it("joins by the `join/` part of the link, as measured, and answers the group", async () => {
    const { environment, sent } = messenger()
    const joined = await runWith(["gr-join", "chats", "join", "https://max.ru/join/abcdef", "--json"], environment)

    expect(joined.code).toBe(0)
    expect(sent(Opcode.CHAT_JOIN)).toEqual([{ link: "join/abcdef" }])
    expect(JSON.parse(joined.stdout).item).toMatchObject({
      operation_id: expect.any(String),
      chat: {
        id: "-70000000000001",
        title: "Team",
        kind: "group",
        access: "private",
        settings: { all_can_pin: true, only_admins_add: false, only_admins_call: null },
      },
    })
    expect(journalOf("gr-join")).toMatchObject([
      { chatId: "-70000000000001", kind: "chat", action: "join", outcome: "sent" },
    ])
  })

  it("says a join only asked when the channel approves who joins, and lists nothing", async () => {
    const asked = {
      id: -70000000000002,
      type: "CHANNEL",
      title: "Gated",
      access: "PRIVATE",
      participants: {},
      joinRequestTime: 1789776000000,
    }
    const { environment } = messenger({ [Opcode.CHAT_JOIN]: { chat: asked } })
    const joined = await runWith(["gr-asked", "chats", "join", "https://max.ru/join/gated", "--json"], environment)
    const listed = await runWith(["gr-asked", "chats", "list", "--json"], environment)

    expect(joined.code).toBe(0)
    expect(JSON.parse(joined.stdout).item).toMatchObject({ requested: true })
    expect(JSON.stringify(JSON.parse(listed.stdout))).not.toContain("-70000000000002")
  })

  it("lists who asked to join with no time, which MAX does not give, and answers each with 77", async () => {
    const asked = {
      contact: { id: 10000003, names: [{ name: "Asker", type: "ONEME" }] },
      presence: { seen: 1789776000 },
    }
    const { environment, sent } = messenger({
      [Opcode.CHAT_MEMBERS]: (request) => (request.type === "JOIN_REQUEST" ? { members: [asked] } : { members: [] }),
      [Opcode.CHAT_MEMBERS_UPDATE]: { chat: GROUP },
    })
    const listed = await runWith(["gr-requests", "chats", "requests", "list", "-70000000000001"], environment)
    const accepted = await runWith(
      ["gr-requests", "chats", "requests", "accept", "-70000000000001", "10000003"],
      environment,
    )
    const declined = await runWith(
      ["gr-requests", "chats", "requests", "decline", "-70000000000001", "10000003"],
      environment,
    )
    const byLink = await runWith(
      ["gr-requests", "chats", "requests", "list", "-70000000000001", 'link:"https://max.ru/join/x"'],
      environment,
    )

    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.stdout).items).toEqual([
      { person_id: "10000003", name: "Asker", username: null, requested_at: null },
    ])
    expect(sent(Opcode.CHAT_MEMBERS).filter((one) => one.type === "JOIN_REQUEST")).toEqual([
      { chatId: -70000000000001, type: "JOIN_REQUEST", count: expect.any(Number) },
    ])
    expect([accepted.code, declined.code]).toEqual([0, 0])
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([
      { chatId: -70000000000001, userIds: [10000003], type: "JOIN_REQUEST", operation: "add" },
      { chatId: -70000000000001, userIds: [10000003], type: "JOIN_REQUEST", operation: "remove" },
    ])
    expect(byLink.stderr).toContain("which link")
    expect(journalOf("gr-requests").map((one) => one.action)).toEqual(["requests.accept", "requests.decline"])
  })

  it("searches requests by name, and refuses answering them all, which MAX has no call for", async () => {
    const { environment, sent } = messenger({ [Opcode.CHAT_MEMBERS]: { members: [] } })
    const searched = await runWith(
      ["gr-req-search", "chats", "requests", "list", "-70000000000001", "--limit", "5", "--page", "1", "name:Ask"],
      environment,
    )
    const all = await Promise.all(
      ["accept", "decline"].flatMap((verb) => [
        runWith(["gr-req-all", "chats", "requests", verb, "-70000000000001", "--all"], environment),
        runWith(
          ["gr-req-all", "chats", "requests", verb, "-70000000000001", "--all", "--link", "https://max.ru/join/x"],
          environment,
        ),
      ]),
    )

    expect(searched.code).toBe(0)
    expect(sent(Opcode.CHAT_MEMBERS)).toContainEqual({
      chatId: -70000000000001,
      type: "JOIN_REQUEST",
      count: expect.any(Number),
      query: "Ask",
    })
    expect(all.map((one) => one.code === 0)).toEqual([false, false, false, false])
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([])
  })

  it("refuses what is not a MAX link before anything is sent", async () => {
    const { environment, max } = messenger()
    const refused = await runWith(["gr-bad-link", "chats", "join", "Team"], environment)

    expect(refused.code).toBe(2)
    expect(sentOnlyLogin(max.sent)).toBe(true)
  })

  it("a link that was reset leads nowhere: not found, in plain words, for `inspect` and `join`", async () => {
    const { environment } = messenger({}, { [Opcode.LINK_INFO]: "not.found", [Opcode.CHAT_JOIN]: "not.found" })

    for (const action of ["inspect", "join"]) {
      const answer = await runWith([`gr-dead-${action}`, "chats", action, "max.ru/join/gone", "--json"], environment)

      expect(answer.code).toBe(6)
      expect(JSON.parse(answer.stderr)).toMatchObject({ error: { code: "not_found" } })
      expect(answer.stderr).toContain("leads nowhere")
    }
  })

  it("`inspect` reads a link and joins nothing", async () => {
    const { environment, sent } = messenger()
    const read = await runWith(["gr-inspect", "chats", "inspect", "max.ru/join/abcdef", "--json"], environment)

    expect(read.code).toBe(0)
    expect(JSON.parse(read.stdout).item).toEqual({
      id: String(GROUP.id),
      kind: "group",
      title: "Team",
      username: null,
      participants_count: 2,
      description: null,
      member: null,
    })
    expect(sent(Opcode.LINK_INFO)).toEqual([{ link: "join/abcdef" }])
    expect(sent(Opcode.CHAT_JOIN)).toEqual([])
    expect(journalOf("gr-inspect")).toEqual([])
  })

  it("leaves a chat named by its title", async () => {
    const { environment, sent } = messenger()
    expect((await runWith(["gr-leave", "chats", "leave", "Team"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_LEAVE).map((payload) => String(payload.chatId))).toEqual(["-70000000000001"])
  })
})

describe("creating a group", () => {
  it("sends one CONTROL message with the title and the people, and counts it as a send", async () => {
    const { environment, sent } = messenger()
    await runWith(["gr-create", "config", "set", "sends_per_hour", "1"])
    const created = await runWith(["gr-create", "chats", "create", "Team", "20000002", "--json"], environment)

    expect(created.code).toBe(0)
    expect(JSON.parse(created.stdout).item).toMatchObject({
      operation_id: expect.any(String),
      chat: { id: String(GROUP.id), kind: "group" },
    })
    const [request] = sent(Opcode.MSG_SEND) as { message: { attaches: Payload[] } }[]
    expect(request?.message.attaches).toEqual([
      { _type: "CONTROL", event: "new", chatType: "CHAT", title: "Team", userIds: [20000002] },
    ])
    expect(journalOf("gr-create")).toMatchObject([{ kind: "chat", action: "create", outcome: "sent", people: 1 }])

    const second = await runWith(["gr-create", "chats", "create", "Again"], environment)
    expect(second.code).toBe(8)
    expect(sent(Opcode.MSG_SEND)).toHaveLength(1)
  })

  it("--channel asks for a channel with the same message", async () => {
    const { environment, sent } = messenger()
    const created = await runWith(["gr-create-channel", "chats", "create", "News", "--channel", "--json"], environment)

    expect(created.code).toBe(0)
    const [request] = sent(Opcode.MSG_SEND) as { message: { attaches: Payload[] } }[]
    expect(request?.message.attaches).toEqual([
      { _type: "CONTROL", event: "new", chatType: "CHANNEL", title: "News", userIds: [] },
    ])
  })

  it("is never retried: an unanswered creation is sent once", async () => {
    const { environment, sent } = messenger({ [Opcode.MSG_SEND]: () => undefined })
    const created = await runWith(["gr-create-once", "chats", "create", "Team"], environment)

    expect(created.code).not.toBe(0)
    expect(sent(Opcode.MSG_SEND)).toHaveLength(1)
  })
})

describe("changing a group", () => {
  it("is refused on a read-only profile before anything reaches MAX, and journalled", async () => {
    const { environment, sent } = messenger()
    await runWith(["gr-ro", "config", "set", "permissions.chats", "readonly"])
    const refused = await runWith(["gr-ro", "chats", "join", "https://max.ru/join/abcdef"], environment)

    expect(refused.code).toBe(5)
    expect(sent(Opcode.CHAT_JOIN)).toEqual([])
    expect(journalOf("gr-ro")).toMatchObject([
      { chatId: null, kind: "chat", action: "join", outcome: "refused", errorCode: "permission_error" },
    ])
  })

  it("with a recipient list, changes only the chats on it", async () => {
    const { environment, sent } = messenger()
    await runWith(["gr-list", "recipients", "add", "-70000000000001"], environment)

    expect((await runWith(["gr-list", "chats", "admins", "remove", "222", "20000002"], environment)).code).toBe(7)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([])
    expect((await runWith(["gr-list", "chats", "admins", "remove", "Team", "20000002"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toHaveLength(1)
  })

  it("with a recipient list, adds or invites only people whose own chat is on it", async () => {
    const { environment, sent } = messenger()
    await runWith(["gr-people", "recipients", "add", "-70000000000001"], environment)

    expect((await runWith(["gr-people", "chats", "members", "add", "Team", "20000002"], environment)).code).toBe(7)
    expect((await runWith(["gr-people", "chats", "create", "Поход", "20000002"], environment)).code).toBe(7)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([])
    expect(sent(Opcode.MSG_SEND)).toEqual([])

    new RecipientList(recipientsPathFor("gr-people"), "max").add({
      id: "555",
      title: "Боря",
      partnerId: "20000002",
      addedAt: new Date().toISOString(),
    })
    expect((await runWith(["gr-people", "chats", "members", "add", "Team", "20000002"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toHaveLength(1)
  })

  it("learns who a one-to-one chat is with when it is added to the list, and fills that in for an older entry", async () => {
    const dialog = { id: 555, type: "DIALOG", participants: { 10000001: 1, 20000002: 1 } }
    const { environment, sent } = messenger({
      [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [GROUP, dialog] },
      [Opcode.CONTACT_INFO]: { contacts: [{ id: 20000002, names: [{ name: "Боря", type: "FULL_NAME" }] }] },
    })
    const list = new RecipientList(recipientsPathFor("gr-partner"), "max")
    list.add({ id: "-70000000000001", title: "Team", addedAt: new Date().toISOString() })
    list.add({ id: "555", title: null, addedAt: new Date().toISOString() })

    expect((await runWith(["gr-partner", "chats", "members", "add", "Team", "20000002"], environment)).code).toBe(7)
    expect((await runWith(["gr-partner", "recipients", "add", "555"], environment)).code).toBe(0)
    expect(list.read()?.find((chat) => chat.id === "555")?.partnerId).toBe("20000002")
    expect((await runWith(["gr-partner", "chats", "members", "add", "Team", "20000002"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toHaveLength(1)
  })

  it("adds without history unless asked, and removes without erasing anyone's messages", async () => {
    const { environment, sent } = messenger()
    const added = await runWith(["gr-members", "chats", "members", "add", "Team", "20000002", "--json"], environment)
    const removed = await runWith(
      ["gr-members", "chats", "members", "remove", "Team", "20000002", "--json"],
      environment,
    )
    expect(JSON.parse(added.stdout).item).toEqual({
      operation_id: expect.any(String),
      chat_id: String(GROUP.id),
      added: ["20000002"],
      not_added: [],
    })
    expect(JSON.parse(removed.stdout).item).toEqual({
      operation_id: expect.any(String),
      chat_id: String(GROUP.id),
      removed: ["20000002"],
    })

    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toMatchObject([
      { userIds: [20000002], operation: "add", showHistory: false },
      { userIds: [20000002], operation: "remove", cleanMsgPeriod: 0 },
    ])
  })

  it("`members add --history` lets the people added see the messages from before", async () => {
    const { environment, sent } = messenger()
    await runWith(["gr-history", "chats", "members", "add", "Team", "20000002", "--history"], environment)

    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toMatchObject([
      { userIds: [20000002], operation: "add", showHistory: true },
    ])
  })

  it("makes an admin with the rights summed as MAX takes them, and refuses a right it does not know", async () => {
    const { environment, sent } = messenger()
    const made = await runWith(
      ["gr-admin", "chats", "admins", "add", "Team", "20000002", "--can", "members,pin"],
      environment,
    )
    const typo = await runWith(["gr-admin", "chats", "admins", "add", "Team", "20000002", "--can", "fly"], environment)

    expect(made.code).toBe(0)
    expect(typo.code).toBe(2)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([
      { chatId: -70000000000001, userIds: [20000002], operation: "add", type: "ADMIN", permissions: 18 },
    ])
  })

  it("grants reading as the app does — both bits of «Read messages» — and the link right", async () => {
    const { environment, sent } = messenger()

    await runWith(["gr-read", "chats", "admins", "add", "Team", "20000002", "--can", "read,delete,link"], environment)

    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([
      {
        chatId: -70000000000001,
        userIds: [20000002],
        operation: "add",
        type: "ADMIN",
        permissions: 1 + 32 + 128 + 1024,
      },
    ])
  })

  it("takes admin rights back with the measured shape, which no other client had", async () => {
    const { environment, sent } = messenger()
    expect((await runWith(["gr-unadmin", "chats", "admins", "remove", "Team", "20000002"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([
      { chatId: -70000000000001, userIds: [20000002], operation: "remove", type: "ADMIN" },
    ])
  })

  it("renames through `theme`, MAX's name for the title", async () => {
    const { environment, sent } = messenger()
    expect((await runWith(["gr-update", "chats", "update", "Team", "--title", "Crew"], environment)).code).toBe(0)
    expect((await runWith(["gr-update", "chats", "update", "Team"], environment)).code).toBe(2)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, theme: "Crew" }])
  })

  it("`update --description` sends the description alone, leaving the title as it is", async () => {
    const { environment, sent } = messenger()
    expect(
      (await runWith(["gr-describe", "chats", "update", "Team", "--description", "Our team"], environment)).code,
    ).toBe(0)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, description: "Our team" }])
  })

  it("`update` sends each setting given under the name MAX has for it", async () => {
    const { environment, sent } = messenger()
    const argv = ["gr-flags", "chats", "update", "Team", "--only-admins-add", "on", "--only-admins-call", "off"]
    await runWith([...argv, "--only-owner-edits-info", "on", "--members-see-link", "off"], environment)

    expect(sent(Opcode.CHAT_UPDATE)).toEqual([
      {
        chatId: -70000000000001,
        options: {
          ONLY_ADMIN_CAN_ADD_MEMBER: true,
          ONLY_ADMIN_CAN_CALL: false,
          ONLY_OWNER_CAN_CHANGE_ICON_TITLE: true,
          MEMBERS_CAN_SEE_PRIVATE_LINK: false,
        },
      },
    ])
  })

  it("`show` reads the settings without sending, and `update` changes only the flags given", async () => {
    const { environment, sent } = messenger()
    const read = await runWith(["gr-settings", "chats", "show", "Team", "--json"], environment)
    expect(JSON.parse(read.stdout).item.settings).toMatchObject({ all_can_pin: true, only_admins_add: false })
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([])

    await runWith(["gr-settings", "chats", "update", "Team", "--all-can-pin", "off"], environment)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, options: { ALL_CAN_PIN_MESSAGE: false } }])
    expect((await runWith(["gr-settings", "chats", "update", "Team", "--all-can-pin", "yes"], environment)).code).toBe(
      2,
    )
  })

  it("`update` with a title and a setting sends them as two requests, and with neither sends nothing", async () => {
    const { environment, sent } = messenger()
    const both = await runWith(
      ["gr-both", "chats", "update", "Team", "--title", "Crew", "--all-can-pin", "on"],
      environment,
    )
    const neither = await runWith(["gr-both", "chats", "update", "Team"], environment)

    expect(both.code).toBe(0)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([
      { chatId: -70000000000001, theme: "Crew" },
      { chatId: -70000000000001, options: { ALL_CAN_PIN_MESSAGE: true } },
    ])
    expect(neither.code).toBe(2)
    expect(neither.stderr).toContain("a setting")
  })

  it("replaces the invite link", async () => {
    const { environment, sent } = messenger()
    expect((await runWith(["gr-link", "chats", "link", "reset", "Team"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, revokePrivateLink: true }])
  })

  it("combined updates report partial application if the settings request is refused", async () => {
    const { environment, sent } = messenger(
      {},
      {
        [Opcode.CHAT_UPDATE]: (request) => (request.options === undefined ? undefined : "settings.denied"),
      },
    )
    const profile = "gr-partial"
    const result = await runWith(
      [profile, "chats", "update", String(GROUP.id), "--title", "Crew", "--all-can-pin", "on", "--json"],
      environment,
    )
    expect(result.code).not.toBe(0)
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "outcome_unknown",
    })
    expect(result.stderr).toContain("title or description changed")
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([
      { chatId: GROUP.id, theme: "Crew" },
      { chatId: GROUP.id, options: { ALL_CAN_PIN_MESSAGE: true } },
    ])
    expect(journalOf(profile)).toMatchObject([
      { operationId: expect.any(String), action: "update", outcome: "outcome_unknown" },
    ])
  })

  it("a rejected rename never sends settings", async () => {
    const { environment, sent } = messenger({}, { [Opcode.CHAT_UPDATE]: "update.denied" })
    const result = await runWith(
      ["gr-first-refused", "chats", "update", String(GROUP.id), "--title", "Crew", "--all-can-pin", "on", "--json"],
      environment,
    )
    expect(JSON.parse(result.stderr).error.code).toBe("provider_error")
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: GROUP.id, theme: "Crew" }])
    expect(journalOf("gr-first-refused")).toMatchObject([{ action: "update", outcome: "failed" }])
  })

  it("leaving and admin writes use the shared results and deduplicate rights", async () => {
    const { environment } = messenger()
    const profile = "gr-results"
    const add = await runWith(
      [profile, "chats", "admins", "add", String(GROUP.id), "20000002", "--can", "members,pin,members", "--json"],
      environment,
    )
    expect(JSON.parse(add.stdout).item).toEqual({
      operation_id: expect.any(String),
      chat_id: String(GROUP.id),
      person_id: "20000002",
      rights: ["members", "pin"],
    })
    const remove = await runWith(
      [profile, "chats", "admins", "remove", String(GROUP.id), "20000002", "--json"],
      environment,
    )
    expect(JSON.parse(remove.stdout).item).toEqual({
      operation_id: expect.any(String),
      chat_id: String(GROUP.id),
      person_id: "20000002",
    })
    const leave = await runWith([profile, "chats", "leave", String(GROUP.id), "--json"], environment)
    expect(JSON.parse(leave.stdout).item).toEqual({ operation_id: expect.any(String), chat_id: String(GROUP.id) })
    expect(journalOf(profile)).toHaveLength(3)
  })

  it("update and link reset return a chat, while link show keeps its result", async () => {
    const { environment, sent } = messenger()
    const profile = "gr-card-results"
    const show = await runWith([profile, "chats", "link", "show", String(GROUP.id), "--json"], environment)
    expect(JSON.parse(show.stdout).item).toEqual({ chat_id: String(GROUP.id), title: "Team", link: GROUP.link })
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([])
    for (const args of [
      ["update", String(GROUP.id), "--title", "Crew"],
      ["link", "reset", String(GROUP.id)],
    ]) {
      const result = await runWith([profile, "chats", ...args, "--json"], environment)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout).item).toMatchObject({
        operation_id: expect.any(String),
        chat: { id: String(GROUP.id) },
      })
    }
    expect(journalOf(profile)).toHaveLength(2)
  })

  const writes = [
    ["join", GROUP.link],
    ["create", "Team", "20000002"],
    ["leave", String(GROUP.id)],
    ["update", String(GROUP.id), "--all-can-pin", "on"],
    ["members", "add", String(GROUP.id), "20000002"],
    ["members", "remove", String(GROUP.id), "20000002"],
    ["admins", "add", String(GROUP.id), "20000002", "--can", "pin"],
    ["admins", "remove", String(GROUP.id), "20000002"],
    ["link", "reset", String(GROUP.id)],
  ]
  it.each(writes.map((args, index) => ({ args, index })))(
    "read-only write $index sends nothing past the login",
    async ({ args, index }) => {
      const { environment, max } = messenger()
      const profile = `gr-guard-${index}`
      await runWith([profile, "config", "set", "permissions.chats", "readonly"])
      const result = await runWith([profile, "chats", ...args, "--json"], environment)
      expect(JSON.parse(result.stderr).error.code).toBe("permission_error")
      expect(sentOnlyLogin(max.sent)).toBe(true)
      expect(journalOf(profile)).toMatchObject([{ operationId: expect.any(String), outcome: "refused" }])
    },
  )
  it.each(writes.map((args, index) => ({ args, index })))(
    "offline write $index never logs in",
    async ({ args, index }) => {
      const { environment, max } = messenger()
      const result = await runWith([`gr-offline-${index}`, "chats", ...args, "--offline", "--json"], environment)
      expect(JSON.parse(result.stderr).error.code).toBe("validation_error")
      expect(max.sent).toEqual([])
    },
  )

  it("reports a provider refusal to add a member, without inventing success", async () => {
    const { environment } = messenger({}, { [Opcode.CHAT_MEMBERS_UPDATE]: "participants.filter.out" })
    const result = await runWith(
      ["gr-add-refused", "chats", "members", "add", String(GROUP.id), "20000002", "--json"],
      environment,
    )
    expect(result.stdout).toBe("")
    expect(result.code).not.toBe(0)
    expect(journalOf("gr-add-refused")).toMatchObject([{ action: "members.add", outcome: "failed" }])
  })

  describe("chats events", () => {
    const at = (minutesAgo: number) => Date.now() - minutesAgo * 60_000
    const history = [
      {
        id: 1n,
        time: at(300),
        sender: 10000001,
        text: "",
        attaches: [{ _type: "CONTROL", event: "new", title: "Team", userIds: [] }],
      },
      { id: 2n, time: at(200), sender: 10000001, text: "hi", attaches: [] },
      {
        id: 3n,
        time: at(100),
        sender: 10000001,
        text: "",
        attaches: [{ _type: "CONTROL", event: "add", userIds: [30000003] }],
      },
      {
        id: 4n,
        time: at(50),
        sender: 10000001,
        text: "",
        attaches: [{ _type: "CONTROL", event: "remove", userId: 30000003 }],
      },
    ]
    const withHistory = () =>
      messenger({
        [Opcode.CHAT_HISTORY]: (request) => ({
          messages: history.filter((message) => message.time >= Number(request.from)).slice(0, Number(request.forward)),
        }),
        [Opcode.CONTACT_INFO]: {
          contacts: [
            { id: 30000003, names: [{ name: "Newcomer", type: "FULL_NAME" }] },
            { id: 10000001, names: [{ name: "Owner", type: "FULL_NAME" }] },
          ],
        },
      })

    it("lists who was added and removed, by whom, and reads no reactions", async () => {
      const { environment, sent } = withHistory()

      const { code, stdout } = await runWith(["gr-events", "chats", "events", "Team", "--json"], environment)

      expect(code).toBe(0)
      const found = JSON.parse(stdout)
      expect(found.items.map((one: { type: string }) => one.type)).toEqual(["create", "add", "remove"])
      expect(found.items[1]).toMatchObject({
        message_id: "3",
        by: { id: "10000001", name: "Owner" },
        people: [{ id: "30000003", name: "Newcomer" }],
      })
      expect(found.items[0].title).toBe("Team")
      expect(sent(Opcode.MSG_GET_REACTIONS)).toEqual([])
      expect(sent(Opcode.CHAT_MARK)).toEqual([])
    })

    it("names a creation by its canonical name and streams one JSON value per event", async () => {
      const { environment, sent } = withHistory()
      const result = await runWith(["gr-event-jsonl", "chats", "events", "Team", "--jsonl"], environment)
      expect(result.code).toBe(0)
      const rows = result.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line))
      expect(rows).toHaveLength(4)
      expect(rows[0].data).toMatchObject({ type: "create", title: "Team" })
      expect(rows.at(-1)).toMatchObject({ type: "end" })
      expect(sent(Opcode.CHAT_MARK)).toEqual([])
    })

    it("passes an unrecognised MAX event through without inventing a name", async () => {
      const { environment } = messenger({
        [Opcode.CHAT_HISTORY]: {
          messages: [{ id: 9n, time: at(50), attaches: [{ _type: "CONTROL", event: "custom-event" }] }],
        },
      })
      const result = await runWith(["gr-custom-event", "chats", "events", "Team", "--json"], environment)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout).items).toMatchObject([{ type: "custom-event", message_id: "9" }])
    })

    it("keeps none of the events from before the time the query names", async () => {
      const { environment } = withHistory()

      const { code, stdout, stderr } = await runWith(
        ["gr-events", "chats", "events", "Team", `time>="${new Date(at(60)).toISOString()}"`, "--json"],
        environment,
      )

      expect(code, stderr).toBe(0)

      expect(JSON.parse(stdout).items.map((one: { type: string }) => one.type)).toEqual(["remove"])
    })
  })

  describe("chats members list", () => {
    const member = (id: number) => ({ contact: { id, names: [{ name: `P${id}`, type: "FULL_NAME" }] }, presence: {} })

    it("fetches the whole list into the store and shows the history it recorded", async () => {
      const { environment } = messenger({
        [Opcode.CHAT_MEMBERS]: () => ({ members: [member(1), member(2)] }),
      })

      rememberAccount(MAX_APP, "gr-history", "10000001", process.env)
      const fetched = await runWith(
        ["gr-history", "chats", "members", "fetch", "Team", "--max-pages", "1", "--json"],
        environment,
      )
      const history = await runWith(
        ["gr-history", "chats", "members", "history", "Team", "time>=1d", "--json"],
        environment,
      )

      expect(fetched.code, fetched.stderr).toBe(0)
      expect(history.code, history.stderr).toBe(0)
      expect(JSON.parse(fetched.stdout).item).toMatchObject({
        read: 2,
        complete: true,
        joined: ["1", "2"],
        tracked: false,
      })
      expect(
        JSON.parse(history.stdout).items.map((one: { type: string; people: { id: string }[] }) => [
          one.type,
          one.people.map((person) => person.id),
        ]),
      ).toEqual([
        ["join", ["1"]],
        ["join", ["2"]],
      ])
    })

    it("reads every page by marker and lists each person once", async () => {
      const { environment, sent } = messenger({
        [Opcode.CHAT_MEMBERS]: (request) =>
          Number(request.marker) === 0
            ? { members: [member(1), member(2)], marker: 77 }
            : { members: [member(2), member(3)] },
      })

      const { code, stdout, stderr } = await runWith(
        ["gr-list", "chats", "members", "list", "Team", "--json"],
        environment,
      )

      expect(code).toBe(0)
      expect(JSON.parse(stdout).items.map((one: { id: string }) => one.id)).toEqual(["1", "2", "3"])
      expect(sent(Opcode.CHAT_MEMBERS)).toEqual([
        { chatId: GROUP.id, type: "MEMBER", marker: 0, count: 50 },
        { chatId: GROUP.id, type: "MEMBER", marker: 77, count: 50 },
      ])
      expect(stderr).not.toContain("only the first")
    })

    it("reads only enough native rows for a requested page, without marking intentional paging incomplete", async () => {
      const { environment, sent } = messenger({
        [Opcode.CHAT_MEMBERS]: (request) =>
          Number(request.marker) === 0
            ? { members: [member(1), member(2), member(3)], marker: 77 }
            : { members: [member(3), member(4), member(5)], marker: 88 },
      })
      const first = await runWith(
        ["gr-window", "chats", "members", "list", "Team", "--limit", "2", "--json"],
        environment,
      )
      expect(JSON.parse(first.stdout)).toMatchObject({
        items: expect.any(Array),
        page: { limit: 2, has_more: true },
        next: [{ step: "page.next", args: { page: 2, limit: 2 } }],
      })
      expect(JSON.parse(first.stdout).items.map((one: { id: string }) => one.id)).toEqual(["1", "2"])
      expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(1)
      expect(first.stderr).not.toContain("member list is incomplete")
      const second = await runWith(
        ["gr-window", "chats", "members", "list", "Team", "--limit", "2", "--page", "2", "--json"],
        environment,
      )
      expect(JSON.parse(second.stdout).items.map((one: { id: string }) => one.id)).toEqual(["3", "4"])
      expect(JSON.parse(second.stdout)).toMatchObject({
        page: { limit: 2, has_more: true },
        next: [{ step: "page.next", args: { page: 3 } }],
      })
      expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(3)
      expect(second.stderr).not.toContain("member list is incomplete")
    })

    it("--all retains the full available read with age and presence fields", async () => {
      const { environment, sent } = messenger({
        [Opcode.CHAT_MEMBERS]: (request) =>
          Number(request.marker) === 0
            ? { members: [member(1)], marker: 77 }
            : {
                members: [
                  {
                    ...member(2),
                    contact: { ...member(2).contact, registrationTime: 1789776000000 },
                    presence: { seen: 1789776100000 },
                  },
                ],
              },
      })
      const result = await runWith(["gr-all", "chats", "members", "list", "Team", "--all", "--json"], environment)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ page: { limit: 2, has_more: false } })
      expect(JSON.parse(result.stdout).items).toHaveLength(2)
      expect(JSON.parse(result.stdout).items[1].registered_at).toBe(new Date(1789776000000).toISOString())
      expect(JSON.parse(result.stdout).items[1].last_seen_at).toBe(new Date(1789776100000).toISOString())
      expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(2)
      expect(sent(Opcode.CHAT_MARK)).toEqual([])
      expect(sent(Opcode.MSG_GET_REACTIONS)).toEqual([])
    })

    it("--all keeps the 5000-member read bound and warns when MAX still has a marker", async () => {
      const { environment, sent } = messenger({
        [Opcode.CHAT_MEMBERS]: (request) => {
          const from = Number(request.marker)
          return { members: Array.from({ length: 50 }, (_, index) => member(from + index + 1)), marker: from + 50 }
        },
      })
      const result = await runWith(["gr-cap", "chats", "members", "list", "Team", "--all", "--json"], environment)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout).items).toHaveLength(5000)
      expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(100)
      expect(result.stderr).toContain("only the first 5000 members were read")
    })

    it("a page beyond a stalled list still warns about the actual number read", async () => {
      const { environment } = messenger({ [Opcode.CHAT_MEMBERS]: () => ({ members: [member(1)], marker: 5 }) })
      const result = await runWith(
        ["gr-empty-page", "chats", "members", "list", "Team", "--page", "2", "--limit", "2", "--json"],
        environment,
      )
      expect(JSON.parse(result.stdout)).toMatchObject({ items: [], page: { limit: 2, has_more: false } })
      expect(result.stderr).toContain("only the first 1 members were read")
    })

    it("stops when a marker repeats instead of asking forever, and says the list is short", async () => {
      const { environment, sent } = messenger({
        [Opcode.CHAT_MEMBERS]: () => ({ members: [member(1)], marker: 5 }),
      })

      const { code, stderr } = await runWith(["gr-loop", "chats", "members", "list", "Team", "--json"], environment)

      expect(code).toBe(0)
      expect(sent(Opcode.CHAT_MEMBERS).length).toBe(2)
      expect(stderr).toContain("only the first 1 members were read")
    })
  })

  it("marks the owner and admins in the member list when the login names them", async () => {
    const { environment } = messenger({
      [Opcode.LOGIN]: {
        profile: { contact: { id: 10000001 } },
        chats: [{ ...GROUP, owner: 10000001, admins: [30000004] }],
      },
      [Opcode.CHAT_MEMBERS]: {
        members: [10000001, 30000004, 30000005].map((id) => ({ contact: { id }, presence: {} })),
      },
    })
    const unknown = messenger({ [Opcode.CHAT_MEMBERS]: { members: [{ contact: { id: 30000005 }, presence: {} }] } })

    const { stdout } = await runWith(["gr-roles", "chats", "members", "list", "Team", "--json"], environment)
    const plain = await runWith(["gr-noroles", "chats", "members", "list", "Team", "--json"], unknown.environment)

    expect(JSON.parse(stdout).items.map((one: { role: string }) => one.role)).toEqual(["owner", "admin", "member"])
    expect(JSON.parse(stdout)).toMatchObject({ page: { has_more: false } })
    expect(JSON.parse(stdout)).not.toHaveProperty("roles_known")
    expect(JSON.parse(plain.stdout)).not.toHaveProperty("roles_known")
    expect(JSON.parse(plain.stdout).items[0].role).toBeUndefined()
    expect(plain.stderr).toContain("who is owner or admin is not known")
  })

  it("shows a recorded group absent from the login delta with unknown settings", async () => {
    const first = messenger()
    expect((await runWith(["gr-delta-show", "chats", "list", "--json"], first.environment)).code).toBe(0)
    const next = messenger({ [Opcode.LOGIN]: { profile: { contact: { id: 10000001 } }, chats: [] } })
    const result = await runWith(["gr-delta-show", "chats", "show", "Team", "--json"], next.environment)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).item).toMatchObject({
      id: String(GROUP.id),
      title: "Team",
      invite_link: null,
      settings: {
        all_can_pin: null,
        only_admins_add: null,
        only_admins_call: null,
        only_owner_edits_info: null,
        members_see_link: null,
      },
    })
    expect(next.sent(Opcode.CHAT_UPDATE)).toEqual([])
  })

  it.each(["members", "events", "inspect"])("offline %s reads never log in", async (name) => {
    const { environment, max } = messenger()
    const args = name === "members" ? [name, "list", "Team"] : name === "inspect" ? [name, GROUP.link] : [name, "Team"]
    const result = await runWith([`gr-read-offline-${name}`, "chats", ...args, "--offline", "--json"], environment)
    // Offline, a member list is read from the store, which this profile has never filled.
    expect(JSON.parse(result.stderr).error.code).toBe(name === "members" ? "not_found" : "validation_error")
    expect(max.sent).toEqual([])
  })

  it("fetches a synthetic roster, then reads its recorded history offline", async () => {
    const { environment, max, sent } = messenger({
      [Opcode.LOGIN]: { profile: { contact: { id: 10000009 } }, chats: [GROUP] },
      [Opcode.CHAT_MEMBERS]: {
        members: [
          { contact: { id: 30999993, names: [{ name: "Synthetic member one", type: "FULL_NAME" }] } },
          { contact: { id: 30999994, names: [{ name: "Synthetic member two", type: "FULL_NAME" }] } },
        ],
      },
    })
    const profile = "gr-roster-adoption"
    expect((await runWith([profile, "chats", "list", "--json"], environment)).code).toBe(0)
    const fetched = await runWith(
      [profile, "chats", "members", "fetch", "Team", "--max-pages", "1", "--json"],
      environment,
    )
    expect(fetched.code).toBe(0)
    expect(JSON.parse(fetched.stdout).item).toMatchObject({
      chat_id: String(GROUP.id),
      read: 2,
      complete: true,
      tracked: false,
    })
    expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(1)
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toEqual([])
    const before = max.sent.length
    const history = await runWith(
      [profile, "chats", "members", "history", "Team", "time>=2026-01-01", "--offline", "--json"],
      environment,
    )
    expect(history.code).toBe(0)
    expect(JSON.parse(history.stdout)).toMatchObject({
      items: [
        { chat_id: String(GROUP.id), type: "join", people: [{ id: "30999993" }] },
        { chat_id: String(GROUP.id), type: "join", people: [{ id: "30999994" }] },
      ],
    })
    expect(max.sent).toHaveLength(before)
    const tracked = await runWith([profile, "chats", "members", "fetch", "Team", "--track", "--json"], environment)
    expect(tracked.code).toBe(0)
    expect(JSON.parse(tracked.stdout).item).toMatchObject({ tracked: true, complete: true })
    expect(sent(Opcode.CHAT_MEMBERS)).toHaveLength(2)
    const afterFetch = max.sent.length
    const list = await runWith([profile, "chats", "tracking", "list", "--json"], environment)
    expect(list.code).toBe(0)
    expect(JSON.parse(list.stdout)).toMatchObject({
      items: [{ chat_id: String(GROUP.id), last_count: { listed: 2, complete: true } }],
    })
    const show = await runWith([profile, "chats", "tracking", "show", "Team", "--json"], environment)
    expect(show.code).toBe(0)
    expect(JSON.parse(show.stdout).item).toMatchObject({ chat_id: String(GROUP.id), tracked_at: expect.any(String) })
    for (const [verb, enabled] of [
      ["remove", false],
      ["add", true],
    ] as const) {
      const answer = await runWith([profile, "chats", "tracking", verb, "Team", "--json"], environment)
      expect(answer.code).toBe(0)
      expect(JSON.parse(answer.stdout).item).toMatchObject({ chat_id: String(GROUP.id), tracked: enabled })
    }
    expect(max.sent).toHaveLength(afterFetch)
  })

  it("shows the invite link, and says so when there is none to see", async () => {
    const { environment } = messenger()

    const shown = await runWith(["gr-link", "chats", "link", "show", "Team", "--json"], environment)
    const none = await runWith(["gr-link", "chats", "link", "show", "Strangers", "--json"], environment)

    expect(JSON.parse(shown.stdout).item).toEqual({
      chat_id: String(GROUP.id),
      title: "Team",
      link: "https://max.ru/join/abcdef",
    })
    expect(none.code).not.toBe(0)
    expect(none.stderr).toContain("shows you no invite link")
  })
})
