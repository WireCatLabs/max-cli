import type { Chat, Contact, Id } from "@leemour/cli-messaging"
import { type AccountKey, type MessageStore, openStore, type PersonFacts } from "@leemour/cli-messaging/store"

const MARKER = "login.marker"

export interface LoginDelta {
  chats: Chat[]
  people: Contact[]
  members: Map<Id, Id[]>
  /** Left out when the login was not this client's own, so the marker would claim changes it never saw. */
  marker?: number
}

/** What `MaxClient` itself keeps in cli-messaging's `messages.db`; history is saved by the shared `stored` wrapper. */
export interface MaxRecord {
  syncMarker(): Promise<number | undefined>
  applyLogin(delta: LoginDelta): Promise<void>
  names(ids: Id[]): Promise<Map<Id, string>>
  remember(people: Contact[]): Promise<void>
  /** The next login asks for everything, as `contacts sync` wants. */
  forgetMarker(): Promise<void>
  /** Everything this account holds in `messages.db`; other accounts stay. */
  purge(): Promise<boolean>
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
    syncMarker: async () => {
      const key = keyOf()
      const saved = key && (await (await store()).syncState(key, MARKER))
      return saved === undefined ? undefined : Number(saved.value)
    },

    applyLogin: async ({ chats, people, members, marker }) => {
      const key = keyOf()
      if (!key) return
      await (await store()).applyDelta(key, {
        chats,
        people: people.map(factsOf),
        members,
        ...(marker === undefined ? {} : { state: { [MARKER]: String(marker) } }),
      })
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

    purge: async () => {
      const key = keyOf()
      if (!key) return false
      await (await store()).purge(key)
      return true
    },

    close: async () => {
      if (opened) await (await opened.catch(() => undefined))?.close()
    },
  }
}

const factsOf = ({ id, name, username, description }: Contact): PersonFacts => ({ id, name, username, description })
