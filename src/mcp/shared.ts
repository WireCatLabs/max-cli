import { CliError } from "@leemour/cli-core"
import { type MessengerAdapter, stored } from "@leemour/cli-messaging/cli"
import { onlineDeps, type Services, servicesFor } from "@leemour/cli-messaging/services"
import { type MessageStore, openStore } from "@leemour/cli-messaging/store"
import { maxAdapter } from "../adapter/max-adapter.js"
import type { MaxClient } from "../client.js"
import { maxMessenger } from "../messenger.js"
import type { SessionStore } from "../session/store.js"

const PASS = { check: () => {}, record: () => {} }

/** The held client guards writes; this call owns only the shared store handle. */
export const withShared = async <T>(
  client: MaxClient,
  { store: state, profile, warn }: { store: SessionStore; profile: string; warn: (message: string) => void },
  read: (services: Services) => Promise<T>,
  { local = false, login = false }: { local?: boolean; login?: boolean } = {},
): Promise<T> => {
  let opened: Promise<MessageStore> | undefined
  let connection: MessengerAdapter | undefined
  const store = () => (opened ??= openStore())
  const key = {
    provider: "max" as const,
    get account(): string {
      const id = state.readState().viewerId
      if (id === undefined) throw new CliError("authentication_error", `no MAX account known for profile ${profile}`)
      return id
    },
  }
  const account = async () => ({ provider: key.provider, account: key.account })
  const adapter = maxAdapter(client, state)
  try {
    if (login) await client.account.me()
    return await read(
      servicesFor({
        ...onlineDeps(maxMessenger, adapter, PASS, { profile }),
        store,
        account,
        offline: local,
        connection: async () => {
          if (connection) return connection
          connection = stored(adapter, { account: key, store, warn, events: () => {} })
          return connection
        },
      }),
    )
  } finally {
    if (opened)
      await opened.then(
        (store) => store.close(),
        () => {},
      )
  }
}
