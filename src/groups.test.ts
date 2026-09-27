import { captureStreams, memoryKeyring } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import type { Payload } from "./protocol/frame.js"
import { SendJournal, sendsPathFor } from "./sends/journal.js"
import { RecipientList, recipientsPathFor } from "./sends/recipients.js"
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

const messenger = (answers: Record<number, Payload | ((request: Payload) => Payload | undefined)> = {}) => {
  const max = mockMax({
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

const journalOf = (profile: string) => new SendJournal(sendsPathFor(profile)).entries()

describe("joining and leaving", () => {
  it("joins by the `join/` part of the link, as measured, and answers the group", async () => {
    const { environment, sent } = messenger()
    const joined = await runWith(["gr-join", "chats", "join", "https://max.ru/join/abcdef", "--json"], environment)

    expect(joined.code).toBe(0)
    expect(sent(Opcode.CHAT_JOIN)).toEqual([{ link: "join/abcdef" }])
    expect(JSON.parse(joined.stdout)).toMatchObject({
      id: "-70000000000001",
      title: "Team",
      kind: "group",
      access: "private",
      settings: { allCanPin: true, onlyAdminsAdd: false, onlyAdminsCall: null },
    })
    expect(journalOf("gr-join")).toMatchObject([
      { chatId: "-70000000000001", kind: "chat", action: "join", outcome: "sent" },
    ])
  })

  it("refuses what is not a MAX link before anything is sent", async () => {
    const { environment, max } = messenger()
    const refused = await runWith(["gr-bad-link", "chats", "join", "Team"], environment)

    expect(refused.code).toBe(2)
    expect(max.sent).toEqual([])
  })

  it("`inspect` reads a link and joins nothing", async () => {
    const { environment, sent } = messenger()
    const read = await runWith(["gr-inspect", "chats", "inspect", "max.ru/join/abcdef", "--json"], environment)

    expect(read.code).toBe(0)
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
    await runWith(["gr-create", "config", "set", "sendsPerHour", "1"])
    const created = await runWith(["gr-create", "chats", "create", "Team", "20000002", "--json"], environment)

    expect(created.code).toBe(0)
    const [request] = sent(Opcode.MSG_SEND) as { message: { attaches: Payload[] } }[]
    expect(request?.message.attaches).toEqual([
      { _type: "CONTROL", event: "new", chatType: "CHAT", title: "Team", userIds: [20000002] },
    ])
    expect(journalOf("gr-create")).toMatchObject([{ kind: "chat", action: "create", outcome: "sent", people: 1 }])

    const second = await runWith(["gr-create", "chats", "create", "Again"], environment)
    expect(second.code).toBe(8)
    expect(sent(Opcode.MSG_SEND)).toHaveLength(1)
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
    await runWith(["gr-ro", "config", "set", "readOnly", "true"])
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

    new RecipientList(recipientsPathFor("gr-people")).add({
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
    const list = new RecipientList(recipientsPathFor("gr-partner"))
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
    await runWith(["gr-members", "chats", "members", "add", "Team", "20000002"], environment)
    await runWith(["gr-members", "chats", "members", "remove", "Team", "20000002"], environment)

    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toMatchObject([
      { userIds: [20000002], operation: "add", showHistory: false },
      { userIds: [20000002], operation: "remove", cleanMsgPeriod: 0 },
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

  it("`settings` reads without sending, and changes only the flags given", async () => {
    const { environment, sent } = messenger()
    const read = await runWith(["gr-settings", "chats", "settings", "Team", "--json"], environment)
    expect(JSON.parse(read.stdout).settings).toMatchObject({ allCanPin: true, onlyAdminsAdd: false })
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([])

    await runWith(["gr-settings", "chats", "settings", "Team", "--all-can-pin", "off"], environment)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, options: { ALL_CAN_PIN_MESSAGE: false } }])
    expect(
      (await runWith(["gr-settings", "chats", "settings", "Team", "--all-can-pin", "yes"], environment)).code,
    ).toBe(2)
  })

  it("replaces the invite link", async () => {
    const { environment, sent } = messenger()
    expect((await runWith(["gr-link", "chats", "link", "reset", "Team"], environment)).code).toBe(0)
    expect(sent(Opcode.CHAT_UPDATE)).toEqual([{ chatId: -70000000000001, revokePrivateLink: true }])
  })

  it("lists join requests as people, and accepts one", async () => {
    const { environment, sent } = messenger()
    const listed = await runWith(["gr-requests", "chats", "requests", "list", "Team", "--json"], environment)
    await runWith(["gr-requests", "chats", "requests", "accept", "Team", "30000003"], environment)

    expect(JSON.parse(listed.stdout)).toMatchObject([{ id: "30000003", name: "Asker" }])
    expect(sent(Opcode.CHAT_MEMBERS_UPDATE)).toMatchObject([
      { userIds: [30000003], type: "JOIN_REQUEST", operation: "add", showHistory: true },
    ])
    expect(journalOf("gr-requests")).toMatchObject([{ action: "requests.accept", people: 1 }])
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
      expect(found.events.map((one: { event: string }) => one.event)).toEqual(["new", "add", "remove"])
      expect(found.events[1]).toMatchObject({
        messageId: "3",
        by: { id: "10000001", name: "Owner" },
        people: [{ id: "30000003", name: "Newcomer" }],
      })
      expect(found.events[0].title).toBe("Team")
      expect(sent(Opcode.MSG_GET_REACTIONS)).toEqual([])
      expect(sent(Opcode.CHAT_MARK)).toEqual([])
    })

    it("keeps only the events --event names, and none from before --since", async () => {
      const { environment } = withHistory()

      const { stdout } = await runWith(
        [
          "gr-events",
          "chats",
          "events",
          "Team",
          "--event",
          "add,remove",
          "--since",
          new Date(at(60)).toISOString(),
          "--json",
        ],
        environment,
      )

      expect(JSON.parse(stdout).events.map((one: { event: string }) => one.event)).toEqual(["remove"])
    })
  })

  describe("chats members list", () => {
    const member = (id: number) => ({ contact: { id, names: [{ name: `P${id}`, type: "FULL_NAME" }] }, presence: {} })

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
      expect(JSON.parse(stdout).map((one: { id: string }) => one.id)).toEqual(["1", "2", "3"])
      expect(sent(Opcode.CHAT_MEMBERS)).toEqual([
        { chatId: GROUP.id, type: "MEMBER", marker: 0, count: 50 },
        { chatId: GROUP.id, type: "MEMBER", marker: 77, count: 50 },
      ])
      expect(stderr).not.toContain("only the first")
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

    expect(JSON.parse(stdout).map((one: { role: string }) => one.role)).toEqual(["owner", "admin", "member"])
    expect(JSON.parse(plain.stdout)[0].role).toBeUndefined()
    expect(plain.stderr).toContain("who is owner or admin is not known")
  })

  it("shows the invite link, and says so when there is none to see", async () => {
    const { environment } = messenger()

    const shown = await runWith(["gr-link", "chats", "link", "show", "Team", "--json"], environment)
    const none = await runWith(["gr-link", "chats", "link", "show", "Strangers", "--json"], environment)

    expect(JSON.parse(shown.stdout)).toEqual({
      chatId: String(GROUP.id),
      title: "Team",
      link: "https://max.ru/join/abcdef",
    })
    expect(none.code).not.toBe(0)
    expect(none.stderr).toContain("shows you no invite link")
  })
})
