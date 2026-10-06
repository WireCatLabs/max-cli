import { CliError } from "@leemour/cli-core"
import { memberFetches } from "@leemour/cli-messaging/cli"
import { chatsService, onlineDeps } from "@leemour/cli-messaging/services"
import { type MessageStore, openStore } from "@leemour/cli-messaging/store"
import { maxAdapter } from "../adapter/max-adapter.js"
import type { MaxClient } from "../client.js"
import { resolveSettings } from "../config.js"
import { maxMessenger } from "../messenger.js"
import { assertReadable } from "../permissions.js"
import type { SessionStore } from "../session/store.js"

export const serveMembers = ({
  client,
  store,
  note,
  env = process.env,
  firstMs,
  everyMs,
}: {
  client: () => MaxClient | undefined
  store: SessionStore
  note: (line: string) => void
  env?: NodeJS.ProcessEnv
  firstMs?: number
  everyMs?: number
}) => {
  let opened: Promise<MessageStore> | undefined
  const worker = memberFetches({
    ...(firstMs === undefined ? {} : { firstMs }),
    ...(everyMs === undefined ? {} : { everyMs }),
    withStore: async (work) => {
      const account = store.readState().viewerId
      if (!account) throw new CliError("authentication_error", "the server has no account")
      opened ??= openStore({ env })
      return work(await opened, { provider: "max", account })
    },
    fetch: async (db, account, chatId) => {
      assertReadable(resolveSettings({ profile: store.profile }, { env }), "chats.members.fetch")
      const held = client()
      if (!held) throw new CliError("network_error", "the server is disconnected")
      if (store.readState().viewerId !== account.account)
        throw new CliError("authentication_error", "the server account changed")
      // Reads use the held connection; the worker must never open its own login.
      const guard = {
        check: () => {
          throw new CliError("permission_error", "member fetching cannot write")
        },
        record: () => {},
      }
      const deps = onlineDeps(maxMessenger, maxAdapter(held, store), guard, { profile: store.profile, env })
      await chatsService({ ...deps, account: async () => account, store: async () => db }).fetchMembers(chatId, {})
    },
    // Provider errors may contain names or message text; only the category belongs in the log.
    warn: () =>
      note(
        "daily member fetching failed; retry with `chats members fetch` or check server connectivity and permissions",
      ),
  })
  return {
    start: worker.start,
    stop: async () => {
      await worker.stop()
      if (opened) {
        const db = opened
        opened = undefined
        const connection = await db.catch(() => undefined)
        await connection?.close()
      }
    },
  }
}
