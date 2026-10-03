import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { captureStreams, memoryKeyring, resolvePaths } from "@leemour/cli-core"
import { SendJournal } from "@leemour/cli-messaging/sends"
import { storePath } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import type { Environment } from "./commands/context.js"
import { Opcode } from "./generated/opcodes.generated.js"
import { run } from "./program.js"
import { Connection } from "./protocol/connection.js"
import { sendsPathFor } from "./sends.js"
import { SessionStore } from "./session/store.js"
import { mockMax } from "./testing/mock-max.js"

const PHONE = "+71234567890"

const FOLDER = {
  id: "folder.personal",
  title: "Personal",
  include: [111],
  filters: [3],
  options: [1],
  sourceId: 7,
  updateTime: 1789776000000,
}

const account = (answers: Record<number, unknown> = {}) => {
  const max = mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: {
          contact: {
            id: 10000001,
            phone: 71234567890,
            names: [{ firstName: "Test", lastName: "Person", name: "Test Person", type: "ONEME" }],
          },
        },
        chats: [
          { id: 111, title: "Friends", type: "CHAT" },
          { id: 222, title: "Work", type: "CHAT" },
        ],
      },
      [Opcode.CONTACT_INFO]: { contacts: [] },
      [Opcode.CONTACT_INFO_BY_PHONE]: { contact: { id: 20000002, names: [{ name: "Found Person" }] } },
      [Opcode.CONTACT_UPDATE]: { contact: { id: 20000002, names: [{ name: "Found Person" }] } },
      [Opcode.SYNC]: { phones: { [PHONE]: 20000002 }, contacts: [] },
      [Opcode.PROFILE]: {
        profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "ONEME" }], description: "hi" } },
      },
      [Opcode.FOLDERS_GET]: { folders: [FOLDER], foldersOrder: [FOLDER.id], folderSync: 1 },
      [Opcode.FOLDERS_UPDATE]: { folder: { ...FOLDER, title: "Renamed" }, folderSync: 2 },
      [Opcode.FOLDERS_DELETE]: { foldersOrder: [], folderSync: 3 },
      [Opcode.SESSIONS_INFO]: { sessions: [{ client: "WEB", current: true, info: "Chrome", time: 1789776000000 }] },
      [Opcode.SESSIONS_CLOSE]: {},
      ...answers,
    },
  })
  const keyring = memoryKeyring()
  const stores: SessionStore[] = []
  const environment: Environment = {
    store: (profile: string) => {
      const store = new SessionStore({ profile, keyring })
      // As `session start` leaves a profile: the token, and the account it logged in as.
      store.writeToken("a-token")
      if (!store.readState().viewerId) store.writeState({ ...store.readState(), viewerId: "10000001" })
      stores.push(store)
      return store
    },
    connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    ask: async () => PHONE,
  }
  const sent = (opcode: number) => max.sent.filter((request) => request.opcode === opcode).map((one) => one.payload)
  return { max, environment, sent, stores }
}

/** Three people with a one-to-one chat each, newest conversation first: Carol, Alice, Bob. */
const acquaintances = () => {
  const person = (id: number, name: string) => ({ id, names: [{ name, type: "FULL_NAME" }] })
  const dialog = (id: number, person: number, lastEventTime: number) => ({
    id,
    type: "DIALOG",
    lastEventTime,
    participants: { 10000001: 1, [person]: 1 },
  })
  return account({
    [Opcode.LOGIN]: {
      time: 1789776000000,
      profile: { contact: { id: 10000001, names: [{ name: "Test Person", type: "ONEME" }] } },
      chats: [dialog(1, 31, 300), dialog(2, 32, 200), dialog(3, 33, 100)],
      contacts: [person(31, "Carol Crane"), person(32, "Alice Avery"), person(33, "Bob Brook")],
    },
  })
}

const idsOf = (stdout: string): string[] => JSON.parse(stdout).items.map((person: { id: string }) => person.id)

const runWith = async (argv: string[], environment: Environment = {}) => {
  const streams = captureStreams()
  const code = await run([...argv, "--json"], { ...environment, streams, tty: false })
  return { code, stdout: streams.stdout.join("\n"), stderr: streams.stderr.join("\n") }
}

const filesUnder = (directory: string): string[] =>
  !existsSync(directory)
    ? []
    : readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))

/** Everywhere `max` writes: state (runs, sends, profiles) and the shared store. */
const expectNowhereOnDisk = (text: string) => {
  const { state, cache } = resolvePaths({ appName: "max-cli", prefix: "MAX", env: process.env })
  for (const directory of [state, cache, dirname(storePath())])
    for (const file of filesUnder(directory)) expect(readFileSync(file, "latin1"), file).not.toContain(text)
}

describe("contacts", () => {
  it("`list` pages the people with a dialog, newest conversation first", async () => {
    const { environment } = acquaintances()
    const first = await runWith(["a-list", "contacts", "list", "--limit", "2"], environment)
    const second = await runWith(["a-list", "contacts", "list", "--limit", "2", "--page", "2"], environment)
    const all = await runWith(["a-list", "contacts", "list", "--limit", "1", "--all"], environment)

    expect(idsOf(first.stdout)).toEqual(["31", "32"])
    expect(JSON.parse(first.stdout).hasMore).toBe(true)
    expect(idsOf(second.stdout)).toEqual(["33"])
    expect(JSON.parse(second.stdout).hasMore).toBe(false)
    expect(idsOf(all.stdout)).toEqual(["31", "32", "33"])
  })

  it("`list --order name` sorts by name, and `--search` keeps only the names that match", async () => {
    const { environment } = acquaintances()
    const byName = await runWith(["a-order", "contacts", "list", "--order", "name"], environment)
    const found = await runWith(["a-order", "contacts", "list", "--search", "rook"], environment)
    const short = await runWith(["a-order", "contacts", "list", "--search", "ro"], environment)

    expect(idsOf(byName.stdout)).toEqual(["32", "33", "31"])
    expect(JSON.parse(found.stdout).items).toMatchObject([{ id: "33", name: "Bob Brook" }])
    expect(JSON.parse(short.stderr).error.code).toBe("validation_error")
  })

  it("`sync` takes everything into the shared store too, so the next shared read goes on from there", async () => {
    let time = 1789776000000
    const login = { profile: { contact: { id: 10000001 } }, chats: [] }
    const answer = () => {
      time += 1000
      return { ...login, time }
    }
    const { environment, sent } = account({ [Opcode.LOGIN]: answer })
    await runWith(["a-resync", "contacts", "list"], environment)
    await runWith(["a-resync", "contacts", "sync"], environment)
    await runWith(["a-resync", "contacts", "list"], environment)

    const markers = sent(Opcode.LOGIN).map((one) => one.contactsSync)
    expect(markers.at(-2)).toBe(0)
    expect(markers.at(-1)).toBe(time - 1000)
  })

  it("shared reads keep their marker without creating a legacy cache", async () => {
    let time = 1789776000000
    const login = { profile: { contact: { id: 10000001 } }, chats: [] }
    const answer = () => {
      time += 1000
      return { ...login, time }
    }
    const { environment, sent } = account({ [Opcode.LOGIN]: answer })
    await runWith(["a-rebuilt", "contacts", "list"], environment)
    expect(existsSync(join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).cache, "a-rebuilt.db"))).toBe(false)
    await runWith(["a-rebuilt", "contacts", "list"], environment)
    await runWith(["a-rebuilt", "contacts", "list"], environment)

    const markers = sent(Opcode.LOGIN).map((one) => one.contactsSync)
    expect(markers.at(-2)).toBe(time - 2000)
    expect(markers.at(-1)).toBe(time - 1000)
    expect(existsSync(join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).cache, "a-rebuilt.db"))).toBe(false)
  })

  it("`sync` forgets where the last login left off, and answers counts with no name in them", async () => {
    const { environment, sent } = acquaintances()
    await runWith(["a-sync", "contacts", "list"], environment)
    await runWith(["a-sync", "contacts", "list"], environment)
    const synced = await runWith(["a-sync", "contacts", "sync"], environment)

    expect(synced.code).toBe(0)
    // The first may already send a marker: messages.db is keyed by the account, and every test here shares it.
    expect(
      sent(Opcode.LOGIN)
        .map((login) => login.contactsSync)
        .slice(1),
    ).toEqual([1789776000000, 0])
    expect(Object.keys(JSON.parse(synced.stdout)).sort()).toEqual(["added", "changed", "full", "known"])
    expect(JSON.parse(synced.stdout)).toMatchObject({ full: true })
    for (const name of ["Carol", "Alice", "Bob"]) expect(synced.stdout + synced.stderr).not.toContain(name)
  })

  it("`lookup` asks for the number and never lets it reach stderr, the send journal or the run log", async () => {
    const { environment, sent } = account()
    const found = await runWith(["a-lookup", "contacts", "lookup", "--record", "--trace"], environment)

    expect(found.code).toBe(0)
    expect(sent(Opcode.CONTACT_INFO_BY_PHONE)).toEqual([{ phone: PHONE }])
    expect(JSON.parse(found.stdout)).toMatchObject({ id: "20000002", name: "Found Person" })
    expect(found.stderr).not.toContain("1234567890")
    expectNowhereOnDisk("1234567890")
  })

  it("`lookup` refuses what is not a number without repeating it", async () => {
    const { environment, sent } = account()
    const refused = await runWith(["contacts", "lookup"], { ...environment, ask: async () => "call 555-mom" })

    expect(JSON.parse(refused.stderr).error.code).toBe("validation_error")
    expect(refused.stderr).not.toContain("555")
    expect(sent(Opcode.CONTACT_INFO_BY_PHONE)).toEqual([])
  })

  it("`add` and `remove` send CONTACT_UPDATE with the id and the action", async () => {
    const { environment, sent } = account()
    const added = await runWith(["contacts", "add", "20000002"], environment)
    expect(added.code).toBe(0)
    expect(JSON.parse(added.stdout)).toEqual({
      operationId: expect.any(String),
      person: { id: "20000002", name: "Found Person", username: null },
    })
    const removed = await runWith(["contacts", "remove", "20000002"], environment)
    expect(removed.code).toBe(0)
    expect(JSON.parse(removed.stdout)).toEqual({ operationId: expect.any(String), personId: "20000002" })

    expect(sent(Opcode.CONTACT_UPDATE).map((one) => ({ ...one, contactId: String(one.contactId) }))).toEqual([
      { contactId: "20000002", action: "ADD" },
      { contactId: "20000002", action: "REMOVE" },
    ])
  })

  it("`block`, `unblock` and `rename` send CONTACT_UPDATE with their action", async () => {
    const { environment, sent } = account()
    for (const argv of [
      ["contacts", "block", "20000002"],
      ["contacts", "unblock", "20000002"],
      ["contacts", "rename", "20000002", "Neighbour", "Ana"],
      ["contacts", "rename", "20000002", "Neighbour"],
    ]) {
      const result = await runWith(argv, environment)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ operationId: expect.any(String) })
    }

    expect(sent(Opcode.CONTACT_UPDATE).map((one) => ({ ...one, contactId: String(one.contactId) }))).toEqual([
      { contactId: "20000002", action: "BLOCK" },
      { contactId: "20000002", action: "UNBLOCK" },
      { contactId: "20000002", action: "UPDATE", firstName: "Neighbour", lastName: "Ana" },
      { contactId: "20000002", action: "UPDATE", firstName: "Neighbour", lastName: null },
    ])
  })

  it("a contact found by phone can be renamed by name without opening the old cache", async () => {
    const { environment, sent } = account()
    expect((await runWith(["a-name", "contacts", "lookup"], environment)).code).toBe(0)
    expect((await runWith(["a-name", "contacts", "rename", "Found Person", "Neighbour"], environment)).code).toBe(0)
    expect(sent(Opcode.CONTACT_UPDATE)).toMatchObject([
      { contactId: 20000002, action: "UPDATE", firstName: "Neighbour" },
    ])
    expect(existsSync(join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).cache, "a-name.db"))).toBe(false)
  })

  it("`import` sends each line of the file as number and name, and reports what MAX recognised", async () => {
    const { environment, sent } = account()
    const file = join(process.env.TMPDIR ?? "/tmp", "phone-book.csv")
    writeFileSync(file, `${PHONE}, Found Person\n\n+7 (999) 000-33-44\tOther One\n`)

    const imported = await runWith(["a-import", "contacts", "import", file, "--record", "--trace"], environment)

    expect(imported.code).toBe(0)
    expect(sent(Opcode.SYNC)).toEqual([
      { contactList: { [PHONE]: { firstName: "Found Person" }, "+79990003344": { firstName: "Other One" } } },
    ])
    expect(JSON.parse(imported.stdout)).toEqual({ operationId: expect.any(String), sent: 2, recognised: [] })
    expect(imported.stdout).not.toContain("1234567890")
    expect(imported.stderr).not.toContain("1234567890")
    for (const file of filesUnder(resolvePaths({ appName: "max-cli", prefix: "MAX", env: process.env }).state))
      if (!file.endsWith(".csv")) expect(readFileSync(file, "latin1"), file).not.toContain("1234567890")
  })

  it("`import` returns recognised contact cards without their private fields", async () => {
    const { environment } = account({
      [Opcode.SYNC]: {
        phones: { [PHONE]: 20000002 },
        contacts: [
          { id: 20000002, phone: 71234567890, description: "private about", names: [{ name: "Found Person" }] },
        ],
      },
    })
    const file = join(process.env.TMPDIR ?? "/tmp", "recognised-book.csv")
    writeFileSync(file, `${PHONE}, Found Person\n`)
    const imported = await runWith(["contacts", "import", file], environment)
    expect(imported.code).toBe(0)
    expect(JSON.parse(imported.stdout)).toEqual({
      operationId: expect.any(String),
      sent: 1,
      recognised: [{ id: "20000002", name: "Found Person", username: null }],
    })
  })

  it.each(["add", "remove", "block", "unblock", "rename"])(
    "a read-only profile refuses contacts %s by id before login and journals once",
    async (action) => {
      const { environment, sent } = account()
      const profile = `contact-readonly-${action}`
      await runWith([profile, "config", "set", "readOnly", "true"])
      const result = await runWith(
        [profile, "contacts", action, "20000002", ...(action === "rename" ? ["Neighbour"] : [])],
        environment,
      )
      expect(result.code).not.toBe(0)
      expect(sent(Opcode.LOGIN)).toEqual([])
      expect(sent(Opcode.CONTACT_UPDATE)).toEqual([])
      const journal = new SendJournal(sendsPathFor(profile))
      expect(journal.entries()).toMatchObject([{ action: `contact-${action}`, outcome: "refused" }])
    },
  )

  it("offline contact writes never connect", async () => {
    const { environment, sent } = account()
    const result = await runWith(["contacts", "add", "20000002", "--offline"], environment)
    expect(result.code).not.toBe(0)
    expect(JSON.parse(result.stderr).error.code).toBe("validation_error")
    expect(sent(Opcode.LOGIN)).toEqual([])
  })

  it("`import` refuses a number written the domestic way without repeating it", async () => {
    const { environment, sent } = account()
    const file = join(process.env.TMPDIR ?? "/tmp", "domestic-book.csv")
    writeFileSync(file, `${PHONE}, Found Person\n8 999 000 33 44, Other One\n`)

    const refused = await runWith(["contacts", "import", file], environment)

    expect(JSON.parse(refused.stderr).error.message).toContain("write a number that starts with 8")
    expect(refused.stderr).not.toContain("999")
    expect(sent(Opcode.SYNC)).toEqual([])
  })

  it("`import` names a bad line by its number only", async () => {
    const { environment, sent } = account()
    const file = join(process.env.TMPDIR ?? "/tmp", "bad-book.csv")
    writeFileSync(file, `${PHONE}, Found Person\n${PHONE}\n`)

    const refused = await runWith(["contacts", "import", file], environment)

    expect(JSON.parse(refused.stderr).error.message).toBe('line 2 is not "number, name"')
    expect(sent(Opcode.SYNC)).toEqual([])
  })
})

describe("the profile", () => {
  it("`account update --description` sends the name the login carried along with it", async () => {
    const { environment, sent } = account()
    const updated = await runWith(["account", "update", "--description", "hi"], environment)

    expect(updated.code).toBe(0)
    expect(sent(Opcode.PROFILE)).toEqual([{ firstName: "Test", lastName: "Person", description: "hi" }])
    expect(JSON.parse(updated.stdout)).toEqual({
      operationId: expect.any(String),
      account: { id: "10000001", name: "Test Person", username: null, phone: null },
    })
  })

  it("a read-only profile refuses before anything is sent, and journals the refusal", async () => {
    const { environment, sent } = account()
    await runWith(["a-readonly", "config", "set", "readOnly", "true"])

    const refused = await runWith(["a-readonly", "account", "update", "--first-name", "X"], environment)

    expect(JSON.parse(refused.stderr).error.code).toBe("permission_error")
    expect(sent(Opcode.PROFILE)).toEqual([])
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(new SendJournal(sendsPathFor("a-readonly")).entries()).toMatchObject([
      { chatId: null, kind: "account", action: "profile", outcome: "refused" },
    ])
  })
  it("returns the shared account shape with a masked phone", async () => {
    const { environment } = account({
      [Opcode.PROFILE]: {
        profile: {
          contact: {
            id: 10000001,
            phone: 71234567890,
            names: [{ name: "Test Person", type: "ONEME" }],
            description: "about me",
          },
        },
      },
    })
    const result = await runWith(["account", "update", "--description", "about me"], environment)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      operationId: expect.any(String),
      account: {
        id: "10000001",
        name: "Test Person",
        username: null,
        phone: "***7890",
      },
    })
    expect(result.stdout).not.toContain("1234567890")
  })

  it.each([{ args: [] }, { args: ["--first-name", "   "] }, { args: ["--description", "hi", "--offline"] }])(
    "refuses invalid or offline changes before login: %j",
    async ({ args }) => {
      const { environment, sent } = account()
      const result = await runWith(["account", "update", ...args], environment)
      expect(JSON.parse(result.stderr).error.code).toBe("validation_error")
      expect(sent(Opcode.LOGIN)).toEqual([])
      expect(sent(Opcode.PROFILE)).toEqual([])
    },
  )
})

describe("the profile's last name", () => {
  it("`account update --last-name` keeps the first name the login carried", async () => {
    const { environment, sent } = account()
    const updated = await runWith(["account", "update", "--last-name", "Newname"], environment)

    expect(updated.code).toBe(0)
    expect(sent(Opcode.PROFILE)).toEqual([{ firstName: "Test", lastName: "Newname" }])
  })
})

describe("the phone number", () => {
  it("`account show` prints only its last four digits, and `--show-phone` the whole of it", async () => {
    const { environment } = account()
    const masked = await runWith(["account", "show"], environment)
    const whole = await runWith(["account", "show", "--show-phone"], environment)

    expect(JSON.parse(masked.stdout).phone).toBe("***7890")
    expect(masked.stdout).not.toContain("123456")
    expect(JSON.parse(whole.stdout).phone).toBe(PHONE)
  })
})

describe("folders", () => {
  it("`list` reads the folders and changes none", async () => {
    const { environment, sent } = account()
    const listed = await runWith(["chats", "folders", "list"], environment)

    expect(listed.code).toBe(0)
    expect(sent(Opcode.FOLDERS_GET)).toHaveLength(1)
    expect(sent(Opcode.FOLDERS_UPDATE)).toEqual([])
    expect(JSON.parse(listed.stdout)).toMatchObject({
      items: [{ id: "folder.personal", title: "Personal" }],
      hasMore: false,
    })
  })

  it("`update` sends the folder back whole, changing only the title, without what MAX keeps for itself", async () => {
    const { environment, sent } = account()
    const updated = await runWith(["chats", "folders", "update", "Personal", "--title", "Renamed"], environment)

    expect(updated.code).toBe(0)
    expect(JSON.parse(updated.stdout)).toEqual({
      operationId: expect.any(String),
      folder: { id: "folder.personal", title: "Renamed", chatIds: ["111"] },
    })
    const [request] = sent(Opcode.FOLDERS_UPDATE)
    expect({ ...request, include: (request as { include: unknown[] }).include.map(String) }).toEqual({
      id: "folder.personal",
      title: "Renamed",
      include: ["111"],
      filters: [3],
      options: [1],
    })
  })

  it("`update --add` and `--remove` change the chats and keep the rest", async () => {
    const { environment, sent } = account()
    await runWith(["chats", "folders", "update", "folder.personal", "--add", "Work", "--remove", "111"], environment)

    expect((sent(Opcode.FOLDERS_UPDATE)[0] as { include: unknown[] }).include.map(String)).toEqual(["222"])
  })

  it("`create` sends a new id with the chats named, and `delete` sends the folder's id", async () => {
    const { environment, sent } = account()
    const createdResult = await runWith(["chats", "folders", "create", "New", "--chat", "Friends"], environment)
    const deletedResult = await runWith(["chats", "folders", "delete", "Personal"], environment)
    expect(createdResult.code).toBe(0)
    expect(deletedResult.code).toBe(0)
    expect(JSON.parse(createdResult.stdout)).toMatchObject({
      operationId: expect.any(String),
      folder: { id: "folder.personal" },
    })
    expect(JSON.parse(deletedResult.stdout)).toEqual({ operationId: expect.any(String), folderId: "folder.personal" })

    const [created] = sent(Opcode.FOLDERS_UPDATE)
    expect(created?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect({ ...created, id: "", include: (created as { include: unknown[] }).include.map(String) }).toEqual({
      id: "",
      title: "New",
      include: ["111"],
      filters: [],
      options: [],
    })
    expect(sent(Opcode.FOLDERS_DELETE)).toEqual([{ folderIds: ["folder.personal"] }])
  })

  it("updates preserve filters, options and favourites, deduplicate additions and let removals win", async () => {
    const { environment, sent } = account({
      [Opcode.FOLDERS_GET]: { folders: [{ ...FOLDER, favorites: [111], filters: [3, 5], options: [1, 2] }] },
    })
    const result = await runWith(
      [
        "chats",
        "folders",
        "update",
        "folder.personal",
        "--add",
        "222",
        "--add",
        "222",
        "--add",
        "111",
        "--remove",
        "111",
      ],
      environment,
    )
    expect(result.code).toBe(0)
    expect(sent(Opcode.FOLDERS_UPDATE)).toHaveLength(1)
    const request = sent(Opcode.FOLDERS_UPDATE)[0] as { include: unknown[] }
    expect({ ...request, include: request.include.map(String) }).toEqual({
      id: "folder.personal",
      title: "Personal",
      include: ["222"],
      filters: [3, 5],
      options: [1, 2],
      favorites: [111],
    })
  })

  it("leaves an automatic folder's include field absent when renaming it", async () => {
    const { include: _include, ...automatic } = FOLDER
    const { environment, sent } = account({ [Opcode.FOLDERS_GET]: { folders: [automatic] } })
    const result = await runWith(["chats", "folders", "update", "folder.personal", "--title", "New"], environment)
    expect(result.code).toBe(0)
    expect(sent(Opcode.FOLDERS_UPDATE)).toEqual([{ id: "folder.personal", title: "New", filters: [3], options: [1] }])
  })

  it("refuses ambiguous titles but accepts a folder id", async () => {
    const { environment, sent } = account({
      [Opcode.FOLDERS_GET]: { folders: [FOLDER, { ...FOLDER, id: "folder.second" }] },
    })
    const ambiguous = await runWith(["chats", "folders", "delete", "Personal"], environment)
    expect(JSON.parse(ambiguous.stderr).error.code).toBe("validation_error")
    expect(sent(Opcode.FOLDERS_DELETE)).toEqual([])
    const byId = await runWith(["chats", "folders", "delete", "folder.second"], environment)
    expect(byId.code).toBe(0)
    expect(sent(Opcode.FOLDERS_DELETE)).toEqual([{ folderIds: ["folder.second"] }])
    expect(JSON.parse(byId.stdout)).toEqual({ operationId: expect.any(String), folderId: "folder.second" })
  })

  it.each(["create", "update", "delete"])(
    "read-only folders %s never writes and journals one refusal",
    async (action) => {
      const { environment, sent } = account()
      const profile = `folder-readonly-${action}`
      await runWith([profile, "config", "set", "readOnly", "true"])
      const args =
        action === "create"
          ? ["New", "--chat", "111"]
          : ["folder.personal", ...(action === "update" ? ["--title", "New"] : [])]
      const result = await runWith([profile, "chats", "folders", action, ...args], environment)
      expect(JSON.parse(result.stderr).error.code).toBe("permission_error")
      expect(sent(Opcode.FOLDERS_UPDATE)).toEqual([])
      expect(sent(Opcode.FOLDERS_DELETE)).toEqual([])
      expect(new SendJournal(sendsPathFor(profile)).entries()).toMatchObject([
        { kind: "account", action: `folder-${action}`, outcome: "refused" },
      ])
      if (action === "create") expect(sent(Opcode.LOGIN)).toEqual([])
    },
  )

  it.each(["list", "create", "update", "delete"])("offline folders %s never logs in", async (action) => {
    const { environment, sent } = account()
    const args =
      action === "list"
        ? []
        : action === "create"
          ? ["New"]
          : ["folder.personal", ...(action === "update" ? ["--title", "New"] : [])]
    const result = await runWith(["chats", "folders", action, ...args, "--offline"], environment)
    expect(JSON.parse(result.stderr).error.code).toBe("validation_error")
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(sent(Opcode.FOLDERS_GET)).toEqual([])
    expect(sent(Opcode.FOLDERS_UPDATE)).toEqual([])
    expect(sent(Opcode.FOLDERS_DELETE)).toEqual([])
  })

  it("refuses an update with no changes before login", async () => {
    const { environment, sent } = account()
    const result = await runWith(["chats", "folders", "update", "folder.personal"], environment)
    expect(JSON.parse(result.stderr).error.message).toContain("nothing to change")
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(sent(Opcode.FOLDERS_UPDATE)).toEqual([])
  })

  it("refuses a title longer than the 20 characters MAX takes, before sending", async () => {
    const { environment, sent } = account()
    const refused = await runWith(["chats", "folders", "create", "x".repeat(21)], environment)
    await runWith(["chats", "folders", "create", "x".repeat(20)], environment)

    expect(refused.stderr).toContain("at most 20 characters")
    expect(sent(Opcode.FOLDERS_UPDATE).map((folder) => folder.title)).toEqual(["x".repeat(20)])
  })
})

describe("sessions", () => {
  it("`list` shows every session and ends none", async () => {
    const { environment, sent } = account()
    const listed = await runWith(["account", "sessions", "list"], environment)

    expect(listed.code).toBe(0)
    expect(sent(Opcode.SESSIONS_INFO)).toHaveLength(1)
    expect(sent(Opcode.SESSIONS_CLOSE)).toEqual([])
    expect(JSON.parse(listed.stdout)).toEqual({
      items: [
        { current: true, client: "WEB", device: "Chrome", location: null, lastActiveAt: "2026-09-19T00:00:00.000Z" },
      ],
      page: 1,
      limit: 1,
      hasMore: false,
    })
  })

  it("`end --others` without --yes sends nothing, and `end` without --others neither", async () => {
    const { environment, sent } = account()
    const refused = await runWith(["account", "sessions", "end", "--others"], environment)
    const unnamed = await runWith(["account", "sessions", "end", "--yes"], environment)

    expect(JSON.parse(refused.stderr).error.code).toBe("confirmation_required")
    expect(JSON.parse(unnamed.stderr).error).toMatchObject({ code: "validation_error" })
    expect(unnamed.stderr).toContain("--others")
    expect(sent(Opcode.SESSIONS_CLOSE)).toEqual([])
    expect(sent(Opcode.LOGIN)).toEqual([])
  })

  it("`end --others --yes` keeps a token MAX hands back, prints none, and lists what is left", async () => {
    const { environment, sent, stores } = account({ [Opcode.SESSIONS_CLOSE]: { token: "a-new-token" } })
    const ended = await runWith(["account", "sessions", "end", "--others", "--yes"], environment)

    expect(ended.code).toBe(0)
    expect(sent(Opcode.SESSIONS_CLOSE)).toEqual([{}])
    expect(stores.at(-1)?.readToken()).toBe("a-new-token")
    expect(ended.stdout + ended.stderr).not.toContain("a-new-token")
    expect(JSON.parse(ended.stdout)).toEqual({
      operationId: expect.any(String),
      sessions: [
        { current: true, client: "WEB", device: "Chrome", location: null, lastActiveAt: "2026-09-19T00:00:00.000Z" },
      ],
    })
  })

  it("`end --others --yes` says so plainly when MAX ended this session too", async () => {
    const max = account()
    const refusing = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: {}, [Opcode.SESSIONS_CLOSE]: {} },
      refuse: { [Opcode.SESSIONS_INFO]: "login.token" },
    })
    const ended = await runWith(["account", "sessions", "end", "--others", "--yes"], {
      ...max.environment,
      connection: () => new Connection({ createSocket: refusing.createSocket, timeoutMs: 50 }),
    })

    expect(JSON.parse(ended.stderr).error.message).toContain("run `max session start`")
    expect(new SendJournal(sendsPathFor("default")).entries().at(-1)).toMatchObject({
      kind: "account",
      action: "sessions-end",
      outcome: "sent",
    })
  })
  it("journals a failed closure as failed", async () => {
    const base = account()
    const max = mockMax({
      answers: { [Opcode.SESSION_INIT]: {}, [Opcode.LOGIN]: {} },
      refuse: { [Opcode.SESSIONS_CLOSE]: "action.denied" },
    })
    const profile = "a-end-failed"
    const result = await runWith([profile, "account", "sessions", "end", "--others", "--yes"], {
      ...base.environment,
      connection: () => new Connection({ createSocket: max.createSocket, timeoutMs: 50 }),
    })
    expect(result.code).not.toBe(0)
    expect(new SendJournal(sendsPathFor(profile)).entries()).toMatchObject([
      { action: "sessions-end", outcome: "failed", operationId: expect.any(String) },
    ])
  })

  it("journals an applied closure when saving its replacement token fails", async () => {
    const { environment, sent } = account({ [Opcode.SESSIONS_CLOSE]: { token: "replacement-token" } })
    const result = await runWith(["a-end-save", "account", "sessions", "end", "--others", "--yes"], {
      ...environment,
      store: (profile) => {
        const store = environment.store?.(profile)
        if (!store) throw new Error("test store missing")
        store.writeToken = () => {
          throw new Error("synthetic save failure")
        }
        return store
      },
    })
    expect(JSON.parse(result.stderr).error.code).toBe("configuration_error")
    expect(result.stdout + result.stderr).not.toContain("replacement-token")
    expect(sent(Opcode.SESSIONS_CLOSE)).toEqual([{}])
    expect(sent(Opcode.SESSIONS_INFO)).toEqual([])
    expect(new SendJournal(sendsPathFor("a-end-save")).entries()).toMatchObject([
      { action: "sessions-end", outcome: "sent", operationId: expect.any(String) },
    ])
  })

  it.each(["offline", "readOnly"])("refuses session closure with %s before login", async (flag) => {
    const { environment, sent } = account()
    const profile = `a-end-${flag}`
    if (flag === "readOnly") await runWith([profile, "config", "set", "readOnly", "true"])
    const result = await runWith(
      [profile, "account", "sessions", "end", "--others", "--yes", ...(flag === "offline" ? ["--offline"] : [])],
      environment,
    )
    expect(result.code).not.toBe(0)
    expect(sent(Opcode.LOGIN)).toEqual([])
    expect(sent(Opcode.SESSIONS_CLOSE)).toEqual([])
  })
})
