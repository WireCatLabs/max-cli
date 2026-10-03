import { CliError } from "@leemour/cli-core"
import type { GlobalFlags, Messenger, ResolveOptions, Settings } from "@leemour/cli-messaging/cli"
import { fromOldSettings, type GuardRequest, type SendGuard } from "@leemour/cli-messaging/sends"
import type { Command } from "commander"
import { maxAdapter } from "./adapter/max-adapter.js"
import { MAX_APP } from "./app.js"
import type { MaxClient } from "./client.js"
import { forCommand } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { rootOf } from "./profile.js"
import { maxRecord } from "./record.js"
import { guardFor } from "./sends.js"
import { SPEECH_MODELS } from "./transcribe/models.js"

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
  partnerOf: (chat) =>
    chat.kind === "dialog" && typeof chat.providerMetadata?.partnerId === "string"
      ? chat.providerMetadata.partnerId
      : undefined,
  speechModels: SPEECH_MODELS,
  // As web.max.ru pages a chat scrolled up: 30 back from the oldest shown (`RES-9`), a person's 5–10 s
  // apart (`NEED-216` A). MAX's ids pass 2^53, so held stretches are kept by send time.
  fetching: { page: 30, pause: "5s", jitter: true, maxPages: 40, orderBy: "time" },

  guard: (command, { profile }, warn) => {
    const client = () => clients.get(rootOf(command))
    const guard = overServer(guardFor(resolveSettings({ profile }), warn), () => client()?.server)
    return {
      ...guard,
      record: (entry) => {
        const applied = client()?.takeApplied(entry.operationId) === true
        // MAX can acknowledge the closure before the token save or follow-up session read fails.
        if (applied && (entry.outcome === "failed" || entry.outcome === "outcome_unknown")) {
          const { errorCode: _errorCode, ...done } = entry
          guard.record({ ...done, outcome: "sent" })
        } else guard.record(entry)
      },
      ask: async (request) => {
        refuseUnmeantDeletion(command, request)
        if (request.action === "sessions-end" && command.optsWithGlobals<{ yes?: boolean }>().yes !== true) {
          throw new CliError(
            "confirmation_required",
            "this logs out every other device, the MAX app on your phone included — add --yes to go ahead",
          )
        }
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
    // max's guard decides its writes (P7 freeze); the levels here only let the shared read gate see the same profile.
    return {
      ...own,
      offline: offline === true,
      configured: {},
      // The shared hearing reads its model as `speechModel`; max's setting is `transcribeModel`.
      shared: { speechModel: own.transcribeModel },
      permissions: fromOldSettings(own.readOnly, own.allow),
      permissionSources: {},
    }
  },

  connect: async (command, context, { events } = {}) => {
    const { createClient, store, reach } = forCommand(command)
    const record = maxRecord({ account: () => store.readState().viewerId, env: context.env })
    try {
      const client = createClient({
        sends: "caller",
        record,
        ...(events ? { events } : {}),
      })
      clients.set(rootOf(command), client)
      const adapter = maxAdapter(client, store, reach, (message) => context.renderer.note(message))
      return {
        ...adapter,
        close: async () => {
          try {
            await adapter.close()
          } finally {
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
