import type { Chat, Contact, Id, Member, PeopleLookup } from "@wirecat/cli-messaging"
import { type AccountKey, type MessageStore, openStore, type PersonFacts } from "@wirecat/cli-messaging/store"

const MARKER = "login.marker"

export interface SyncSummary {
  known: number
  added: number
  changed: number
}

export interface LoginDelta {
  chats: Chat[]
  people: Contact[]
  members: Map<Id, Id[]>
  /** Left out when the login was not this client's own, so the marker would claim changes it never saw. */
  marker?: number
}

/** MAX login data and transcripts in `messages.db`; history is saved by the shared `stored` wrapper. */
export interface MaxRecord {
  transcript(chatId: Id, messageId: Id): Promise<{ text: string; source: string } | undefined>
  keepTranscript(chatId: Id, messageId: Id, text: string, source: string): Promise<void>
  syncMarker(): Promise<number | undefined>
  applyLogin(delta: LoginDelta): Promise<SyncSummary | undefined>
  people(): Promise<PeopleLookup>
  chatsWith(personId: Id): Promise<Chat[]>
  rememberChats(chats: Chat[], complete: boolean): Promise<Chat[]>
  members(chatId: Id): Promise<Member[]>
  names(ids: Id[]): Promise<Map<Id, string>>
  remember(people: Contact[]): Promise<void>
  /** The next login asks for everything, as `contacts sync` wants. */
  forgetMarker(): Promise<void>
  close(): Promise<void>
}

/**
 * The store opens on first use, and the account is read then too: the first login of a new profile
 * is what names it.
 */
export const maxRecord = ({ account, env }: { account: () => Id | undefined; env?: NodeJS.ProcessEnv }): MaxRecord => {
  let opened: Promise<MessageStore> | undefined
  const store = () => {
    opened ??= openStore(env === undefined ? {} : { env })
    return opened
  }
  const keyOf = (): AccountKey | undefined => {
    const id = account()
    return id === undefined ? undefined : { provider: "max", account: id }
  }

  return {
    transcript: async (chatId, messageId) => {
      const key = keyOf()
      return key ? (await store()).transcript(key, chatId, messageId) : undefined
    },

    keepTranscript: async (chatId, messageId, text, source) => {
      const key = keyOf()
      if (!key) throw new Error("cannot keep a transcript before the MAX account is known")
      await (await store()).keepTranscript(key, chatId, messageId, text, source)
    },

    syncMarker: async () => {
      const key = keyOf()
      const saved = key && (await (await store()).syncState(key, MARKER))
      return saved === undefined ? undefined : Number(saved.value)
    },

    applyLogin: async ({ chats, people, members, marker }) => {
      const key = keyOf()
      if (!key) return
      const db = await store()
      const known = await db.people("max", { account: key.account })
      const added = people.filter((person) => !known.get(person.id)).length
      await db.applyDelta(key, {
        chats,
        people: people.map(factsOf),
        members,
        ...(marker === undefined ? {} : { state: { [MARKER]: String(marker) } }),
      })
      return {
        known: (await db.people("max", { account: key.account })).all().length,
        added,
        changed: people.length - added,
      }
    },

    people: async () => {
      const key = keyOf()
      return key ? (await store()).people("max", { account: key.account }) : { get: () => undefined, all: () => [] }
    },

    chatsWith: async (personId) => {
      const key = keyOf()
      return key ? (await store()).chatsWith(key, personId) : []
    },

    rememberChats: async (chats, complete) => {
      const key = keyOf()
      if (!key) return chats
      const db = await store()
      await db.saveChats(key, chats)
      if (complete && chats.length > 0)
        await db.markChatsLeft(
          key,
          chats.map((chat) => chat.id),
        )
      return (await db.chats(key, {})).items
    },

    members: async (chatId) => {
      const key = keyOf()
      return key ? (await store()).members(key, chatId) : []
    },

    names: async (ids) => {
      const key = keyOf()
      const names = new Map<Id, string>()
      if (!key || ids.length === 0) return names
      const known = await (await store()).people("max", { account: key.account })
      for (const id of ids) {
        const name = known.get(id)?.name
        if (name) names.set(id, name)
      }
      return names
    },

    remember: async (people) => {
      const key = keyOf()
      if (key && people.length > 0) await (await store()).savePeople(key, people.map(factsOf))
    },

    forgetMarker: async () => {
      const key = keyOf()
      if (key) await (await store()).clearSyncState(key, MARKER)
    },

    close: async () => {
      if (opened) await (await opened.catch(() => undefined))?.close()
    },
  }
}

const factsOf = ({ id, name, username, description }: Contact): PersonFacts => ({ id, name, username, description })
