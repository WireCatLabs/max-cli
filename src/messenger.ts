import type { GlobalFlags, Messenger, ResolveOptions, Settings } from "@wirecat/cli-core/cli"
import { AI_SETTING_KEYS } from "@wirecat/cli-core/cli"
import { type Asker, type GuardRequest, keyForWrite, type SendGuard } from "@wirecat/cli-core/sends"
import { moderationService } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { type MaxAdapter, maxAdapter } from "./adapter/max-adapter.js"
import { MAX_APP } from "./app.js"
import type { MaxClient } from "./client.js"
import { environmentOf, forCommand } from "./commands/context.js"
import { resolveSettings } from "./config.js"
import { approvePermission, askerFor, commandPermission, forgetApprovals, permissionKeyOf } from "./permissions.js"
import { rootOf } from "./profile.js"
import { maxRecord } from "./record.js"
import { guardFor } from "./sends.js"
import { SKILL } from "./skill.js"
import { SPEECH_MODELS } from "./transcribe/models.js"

/** The client each command connected, so its guard can tell whether `max serve` journals for it. */
const clients = new WeakMap<Command, MaxClient>()

/**
 * Over `max serve` the server reserves and journals each write it forwards, with the outcome it saw;
 * the command checks too, and records only what it refused itself (`NEED-269`).
 */
export const overServer = (guard: SendGuard, server: () => { readonly journals: boolean } | undefined): SendGuard => {
  const ask = guard.ask
  return {
    ...(ask ? { ask: (request: GuardRequest) => ask.call(guard, request) } : {}),
    check: (request) => guard.check(request, server() ? { reserve: false } : {}),
    record: (entry) => {
      const through = server()
      if (!through || entry.outcome === "refused" || !through.journals) guard.record(entry)
    },
  }
}

/** One subcommand of a shared command group, to sit among max's own. */
export const sharedSubcommand = (group: Command, name: string): Command => {
  const found = group.commands.find((one) => one.name() === name)
  if (!found) throw new Error(`cli-core's ${group.name()} has no ${name}`)
  return found
}

/** What cli-core's shared commands and services need from max, for the personal account. */
export const maxMessenger: Messenger = {
  inviteLinkCreate: false,
  inviteLinkList: false,
  inviteLinkRevoke: false,
  joinRequestsByLink: false,
  channelComments: false,
  folderJoin: false,
  groupPhoto: true,
  chatMedia: true,
  privacy: true,
  chatMute: true,
  chatDeletion: true,
  personalBots: true,
  stickers: true,
  app: MAX_APP,
  provider: "max",
  topics: false,
  skill: SKILL,
  diagnose: async (command) => {
    const { store } = forCommand(command)
    let token: string
    try {
      token = store.tokenSource() ?? "none"
    } catch {
      token = "unreachable"
    }
    return { kind: store.isBot() ? "personal + bot" : "personal", token, logged_in_here: store.hasLoggedIn() }
  },
  counterFields: ["views", "reactions"],
  name: "MAX",
  chatArgument: "a chat: its id, or part of its title",
  partnerOf: (chat) =>
    chat.kind === "dialog" && typeof chat.providerMetadata?.partnerId === "string"
      ? chat.providerMetadata.partnerId
      : undefined,
  speechModels: SPEECH_MODELS,
  // As web.max.ru pages a chat scrolled up: 30 back from the oldest shown (`RES-9`), a person's 5–10 s
  // apart (`NEED-216` A). MAX's ids pass 2^53, so held stretches are kept by send time.
  fetching: { page: 30, pause: "5s", jitter: true, maxPages: 40, orderBy: "time", beforeInclusive: true },
  // A tab makes a handful of requests at a time, then one every few seconds; MAX's limits are unpublished.
  pace: { perMinute: 20, burst: 10 },

  permissionKey: permissionKeyOf,
  tracksMembers: true,
  // A named chat goes to opcode 73, no chat to 68 — the best message of each chat (measured 2026-10-11).
  serverSearch: true,

  guard: (command, settings, warn, ask?: Asker) => {
    const client = () => clients.get(rootOf(command))
    // The server's own asker approves; `max serve` checks again and needs the approval sent with the write.
    const approving: Asker | undefined = ask
      ? async (key, request) => {
          await ask(key, request)
          approvePermission(key, request.operationId)
        }
      : undefined
    const guard = overServer(
      guardFor(
        settings,
        warn,
        approving ?? askerFor(command.optsWithGlobals(), environmentOf(command)),
        commandPermission(command) ?? undefined,
      ),
      () => client()?.server,
    )
    return {
      ...guard,
      ...(ask
        ? {
            // Over MCP the client is where the profile's levels and this server's `--permission` apply.
            check: (request, options) => {
              guard.check(request, options)
              approvePermission(
                request.key ?? keyForWrite(request.kind ?? "message", request.action),
                request.operationId,
              )
            },
          }
        : {}),
      record: (entry) => {
        forgetApprovals(entry.operationId)
        const applied = client()?.takeApplied(entry.operationId) === true
        // MAX can acknowledge the closure before the token save or follow-up session read fails.
        if (applied && (entry.outcome === "failed" || entry.outcome === "outcome_unknown")) {
          const { errorCode: _errorCode, ...done } = entry
          guard.record({ ...done, outcome: "sent" })
        } else guard.record(entry)
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
        ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
        ...(options.withIssues === undefined ? {} : { withIssues: options.withIssues }),
        ...(options.needsProfile === undefined ? {} : { needsProfile: options.needsProfile }),
      },
    )
    return {
      ...own,
      offline: offline === true,
      configured: Object.fromEntries(AI_SETTING_KEYS.map((key) => [key, own[key]])),
      // The shared hearing reads its model as `speechModel`; max's setting is `transcribeModel`.
      shared: {
        ...Object.fromEntries(AI_SETTING_KEYS.map((key) => [key, own[key]])),
        speechModel: own.transcribeModel,
      },
      permissions: own.permissions,
      permissionSources: own.permissionSources,
    }
  },

  services: (_base, deps) => ({
    moderation: moderationService({
      ...deps,
      connection: async () => {
        const adapter = await deps.connection()
        return new Proxy(adapter, {
          get: (target, key, receiver) =>
            key === "resolve" ? (reference: string) => target.chat(reference) : Reflect.get(target, key, receiver),
        })
      },
    }),
  }),

  connect: async (command, context, { events } = {}) => {
    const { createClient, store, reach } = forCommand(command)
    const record = maxRecord({ account: () => store.viewerId(), env: context.env })
    let opened: MaxAdapter | undefined
    try {
      const client = createClient({
        record,
        ...(events ? { events } : {}),
      })
      clients.set(rootOf(command), client)
      const adapter = maxAdapter(client, store, reach, (message) => context.renderer.note(message), {
        reactions: command.name() !== "moderate",
      })
      opened = adapter
      // cli-core names the account once, at connect; a profile that never logged in has no id until LOGIN answers.
      if (adapter.self() === null) await client.connect()
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
      try {
        await opened?.close()
      } finally {
        await record.close()
      }
      throw error
    }
  },
}
