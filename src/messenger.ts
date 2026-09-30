import type { GlobalFlags, Messenger, ResolveOptions, Settings } from "@leemour/cli-messaging/cli"
import type { Command } from "commander"
import { maxAdapter } from "./adapter/max-adapter.js"
import { MAX_APP } from "./app.js"
import { openProfileCache } from "./cache/index.js"
import type { MaxClient } from "./client.js"
import { forCommand } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { rootOf } from "./profile.js"
import { guardFor } from "./sends.js"

/** The client each command connected, so its guard can tell whether `max serve` journals for it. */
const clients = new WeakMap<Command, MaxClient>()

/** What cli-messaging's shared commands and services need from max, for the personal account. */
export const maxMessenger: Messenger = {
  app: MAX_APP,
  provider: "max",
  name: "MAX",
  chatArgument: "a chat: its id, or part of its title",

  // Over `max serve` the server reserves and journals each write it forwards, with the outcome it saw;
  // the command checks too, and records only what it refused itself (`NEED-269`).
  guard: (command, { profile }, warn) => {
    const own = guardFor(resolveSettings({ profile }), warn)
    const server = () => clients.get(rootOf(command))?.server
    return {
      check: (request) => own.check(request, server() ? { reserve: false } : {}),
      record: (entry) => {
        const through = server()
        if (!through || entry.outcome === "refused" || !through.journals) own.record(entry)
      },
    }
  },

  resolveSettings: (flags: GlobalFlags, options: ResolveOptions = {}): Settings => {
    const { profile, offline, ...rest } = flags
    const own = resolveSettings(
      { ...rest, ...(profile === undefined ? {} : { profile }) },
      {
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
      },
    )
    return { ...own, offline: offline === true, configured: {}, shared: {} }
  },

  // Built with the profile's cache — without it `chats show` has no members and `contacts show`
  // refuses — and without the send guard, which the shared services hold.
  connect: async (command, _context, { events } = {}) => {
    const { settings, renderer, createClient, store } = forCommand(command)
    const cache = await openProfileCache(settings.profile, { onProblem: renderer.note })
    const client = createClient({ sends: undefined, ...(cache ? { cache } : {}), ...(events ? { events } : {}) })
    clients.set(rootOf(command), client)
    const adapter = maxAdapter(client, store)
    return {
      ...adapter,
      close: async () => {
        try {
          await adapter.close()
        } finally {
          await cache?.close()
        }
      },
    }
  },
}
