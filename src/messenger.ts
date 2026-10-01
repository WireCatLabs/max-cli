import { CliError } from "@leemour/cli-core"
import type { GlobalFlags, Messenger, ResolveOptions, Settings } from "@leemour/cli-messaging/cli"
import { fromOldSettings, type GuardRequest, type SendGuard } from "@leemour/cli-messaging/sends"
import type { Command } from "commander"
import { maxAdapter } from "./adapter/max-adapter.js"
import { MAX_APP } from "./app.js"
import { openProfileCache } from "./cache/index.js"
import type { MaxClient } from "./client.js"
import { forCommand } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { rootOf } from "./profile.js"
import { maxRecord } from "./record.js"
import { guardFor } from "./sends.js"

/** The client each command connected, so its guard can tell whether `max serve` journals for it. */
const clients = new WeakMap<Command, MaxClient>()

/**
 * Over `max serve` the server reserves and journals each write it forwards, with the outcome it saw;
 * the command checks too, and records only what it refused itself (`NEED-269`).
 */
export const overServer = (guard: SendGuard, server: () => { readonly journals: boolean } | undefined): SendGuard => ({
  check: (request) => guard.check(request, server() ? { reserve: false } : {}),
  record: (entry) => {
    const through = server()
    if (!through || entry.outcome === "refused" || !through.journals) guard.record(entry)
  },
})

/**
 * Since cli-messaging 0.76 the shared `messages delete` leaves its `--allow-dangerous` to the
 * guard's permission levels, which max does not use until its half of P7 lands. Until then a
 * deletion is refused without the flag, as before, and nothing asks instead (`NEED-238`).
 */
const refuseUnmeantDeletion = (command: Command, { kind, count }: GuardRequest): void => {
  if (kind !== "delete" || command.optsWithGlobals<{ allowDangerous?: boolean }>().allowDangerous === true) return
  throw new CliError(
    "confirmation_required",
    `this deletes ${count === 1 ? "a message" : `${count ?? "the"} messages`} and cannot be undone — ` +
      "add --allow-dangerous to go ahead",
  )
}

/** One subcommand of a shared command group, to sit among max's own. */
export const sharedSubcommand = (group: Command, name: string): Command => {
  const found = group.commands.find((one) => one.name() === name)
  if (!found) throw new Error(`cli-messaging's ${group.name()} has no ${name}`)
  return found
}

/** What cli-messaging's shared commands and services need from max, for the personal account. */
export const maxMessenger: Messenger = {
  app: MAX_APP,
  provider: "max",
  name: "MAX",
  chatArgument: "a chat: its id, or part of its title",

  guard: (command, { profile }, warn) => ({
    ...overServer(guardFor(resolveSettings({ profile }), warn), () => clients.get(rootOf(command))?.server),
    ask: async (request) => refuseUnmeantDeletion(command, request),
  }),

  resolveSettings: (flags: GlobalFlags, options: ResolveOptions = {}): Settings => {
    const { profile, offline, ...rest } = flags
    const own = resolveSettings(
      { ...rest, ...(profile === undefined ? {} : { profile }) },
      {
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      },
    )
    // max's guard decides its writes (P7 freeze); the levels here only let the shared read gate see the same profile.
    return {
      ...own,
      offline: offline === true,
      configured: {},
      shared: {},
      permissions: fromOldSettings(own.readOnly, own.allow),
      permissionSources: {},
    }
  },

  // Built with the profile's cache — without it `chats show` has no members and `contacts show`
  // refuses — and without the send guard, which the shared services hold. The record keeps what the
  // login brings in `messages.db`, where the shared reads look.
  connect: async (command, context, { events } = {}) => {
    const { settings, renderer, createClient, store } = forCommand(command)
    const record = maxRecord({ account: () => store.readState().viewerId, env: context.env })
    try {
      const cache = await openProfileCache(settings.profile, { onProblem: renderer.note })
      const client = createClient({
        sends: undefined,
        record,
        ...(cache ? { cache } : {}),
        ...(events ? { events } : {}),
      })
      clients.set(rootOf(command), client)
      const adapter = maxAdapter(client, store)
      return {
        ...adapter,
        close: async () => {
          try {
            await adapter.close()
          } finally {
            await cache?.close()
            await record.close()
          }
        },
      }
    } catch (error) {
      await record.close()
      throw error
    }
  },
}
