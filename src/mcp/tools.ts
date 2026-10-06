import { CliError } from "@leemour/cli-core"
import {
  AI_SETTING_KEYS,
  answerMcpTool,
  failMcpTool,
  type PersonalMcpDefaults,
  type PersonalMcpRegistration,
  type PersonalMcpTool,
  personalMcpConfirmer,
  personalMcpToolKey,
  personalMcpTools,
  registerPersonalMcpTools,
  rememberAccount,
  stored,
} from "@leemour/cli-messaging/cli"
import { levelFor, type Permission } from "@leemour/cli-messaging/sends"
import { openStore } from "@leemour/cli-messaging/store"
import type { McpServer } from "@modelcontextprotocol/server"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"
import { maxAdapter } from "../adapter/max-adapter.js"
import { MAX_APP } from "../app.js"
import type { MaxClient } from "../client.js"
import { type McpToolGroup, resolveSettings } from "../config.js"
import type { Reach } from "../download.js"
import { maxMessenger } from "../messenger.js"
import { migrateModerationPoints } from "../moderation/points.js"
import { assertReadable, withPermissionApproval } from "../permissions.js"
import { maxRecord } from "../record.js"
import type { SessionStore } from "../session/store.js"
import { transcribe } from "../transcribe/index.js"
import { modelsDirectory } from "../transcribe/install.js"
import { DEFAULT_MODEL, speechModel } from "../transcribe/models.js"
import { registerLegacyCheck } from "./legacy-check.js"
import { photoForMcp } from "./photo.js"
import type { MaxSession } from "./session.js"
import { withShared } from "./shared.js"

const PASS = { check: () => {}, record: () => {} }
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true }

interface Options {
  allowSend: boolean
  confirmSend?: boolean
  yes?: boolean
  allowDangerous?: boolean
  allowMarkRead?: boolean
  allowDelete?: boolean
  allowModerate?: boolean
  store: SessionStore
  defaultLimit: number
  history?: boolean
  profile: string
  permission?: string[]
  transcribeModel?: string
  permitted?: readonly Permission[]
  toolGroups?: readonly McpToolGroup[]
  warn?: (message: string) => void
  reach?: Reach
  embedders?: PersonalMcpDefaults["embedders"]
  /**
   * One per server, shared by every instance its factory builds: over HTTP each request may meet a
   * fresh instance, and the form's answer must reach the one that issued it.
   */
  confirmed?: ReturnType<typeof personalMcpConfirmer>
}

export const registerTools = (
  server: McpServer,
  session: MaxSession,
  {
    confirmSend = false,
    yes = false,
    allowDangerous = false,
    store,
    defaultLimit,
    history,
    profile,
    permission,
    transcribeModel = DEFAULT_MODEL,
    warn = () => {},
    reach,
    embedders,
    confirmed = personalMcpConfirmer(),
  }: Options,
): void => {
  const settings = () => resolveSettings({ profile, permission })
  const adapters = new WeakMap<object, MaxClient>()
  const definitions = personalMcpTools(maxMessenger)
  const tracked = definitions.chats_tracking_list
  if (tracked)
    definitions.chats_tracking_list = {
      ...tracked,
      title: "Tracked MAX groups",
      description:
        "The tracked MAX groups and their last saved member counts: { items: [{ chatId, title, trackedAt, " +
        "lastCount: { day, participants, listed, complete } | null }] }. Reads the local store only. " +
        "The owner adds one with max chats tracking add and records its roster with max chats members fetch. " +
        "MAX serve does not fetch member lists daily.",
    }
  const counts = definitions.chats_tracking_show
  if (counts)
    definitions.chats_tracking_show = {
      ...counts,
      description:
        "A MAX group's tracking state and saved member counts for the last 30 days: " +
        "{ chatId, trackedAt | null, counts: [{ day, participants, listed, complete }] }. " +
        "complete is false when the member list was not read whole. Reads the local store only. " +
        "The owner records rosters with max chats members fetch; MAX serve does not fetch them daily.",
    }
  for (const name of ["topics_list", "topics_enable", "topics_create"]) delete definitions[name]
  const rules = definitions.chats_rules_show
  if (rules) definitions.chats_rules = { ...rules, key: "chats.rules.show" }

  const keyOf = (name: string, definition: PersonalMcpTool) => personalMcpToolKey(name, definition) ?? "messages"
  const writable = (name: string, definition: PersonalMcpTool) => {
    const key = keyOf(name, definition)
    const own = settings()
    assertReadable(own, key)
    if (definition.annotations.readOnlyHint !== true && levelFor(own.permissions, key).level === "readonly")
      throw new CliError("permission_error", `profile ${profile} does not let ${key} write`, { permission: key })
    return key
  }
  const inScope: NonNullable<PersonalMcpRegistration["around"]> = (name, definition, work) => {
    const key = writable(name, definition)
    if (key === "chats.moderate") migrateModerationPoints(store)
    return withPermissionApproval(key, () =>
      key === "chats.moderate"
        ? withPermissionApproval("messages.delete", () => withPermissionApproval("chats.members.remove", work))
        : work(),
    )
  }
  const remember = () => {
    const account = store.readState().viewerId
    if (!account) return
    try {
      rememberAccount(MAX_APP, profile, account, process.env)
    } catch {
      // A secondary local binding must not replace a successful send or prevent store cleanup.
      warn("could not remember the account for local archive tools")
    }
  }
  const adapterFor = (client: MaxClient) => {
    const adapter = maxAdapter(client, store, reach, warn)
    adapters.set(adapter, client)
    return adapter
  }
  const offered = Object.fromEntries(
    Object.entries(definitions).filter(([name, definition]) => {
      const level = levelFor(settings().permissions, keyOf(name, definition)).level
      return level !== "deny" && (definition.annotations.readOnlyHint === true || level !== "readonly")
    }),
  )
  const direct = offered.messages_transcribe
  const picture = offered.messages_photo
  if (picture)
    offered.messages_photo = {
      ...picture,
      online: (adapter, args) => {
        const client = adapters.get(adapter)
        if (!client) throw new Error("MAX photo preview requires its held adapter")
        return photoForMcp(
          client,
          {
            chat: String(args.chat),
            message: String(args.message),
            ...(typeof args.index === "number" ? { index: args.index } : {}),
          },
          reach,
        )
      },
    }
  if (direct)
    offered.messages_transcribe = {
      ...direct,
      description:
        "A MAX voice message as text on this machine. Reuses a retained transcript from the same model; never downloads a model. Returns { messageId, text, model, cached? }.",
      online: async (adapter, args, defaults) => {
        const client = adapters.get(adapter)
        if (!client) throw new Error("MAX transcription requires its held adapter")
        const message = String(args.message)
        if (!/^\d+$/.test(message)) throw new CliError("validation_error", "MAX message IDs must be decimal strings")
        const chatId = await client.chats.resolve(String(args.chat))
        const model = speechModel(typeof args.model === "string" ? args.model : transcribeModel)
        const record = maxRecord({ account: () => store.readState().viewerId })
        try {
          const kept = await record.transcript(chatId, message)
          if (kept?.source === model.id) return { messageId: message, text: kept.text, model: model.id, cached: true }
          return await transcribe(client, chatId, message, {
            model,
            directory: modelsDirectory(),
            record,
            ...(defaults.release ? { release: defaults.release } : {}),
          })
        } finally {
          await record.close()
        }
      },
    }
  const needsForm = (name: string, definition: PersonalMcpTool) =>
    confirmSend ||
    (levelFor(settings().permissions, keyOf(name, definition)).level === "ask" &&
      !(keyOf(name, definition) === "messages.delete" ? allowDangerous : yes))
  for (const [name, definition] of Object.entries(offered)) {
    if (!definition.permission || needsForm(name, definition) || !definition._meta) continue
    const { _meta, ...rest } = definition
    const metadata = { ..._meta }
    delete metadata["anthropic/requiresUserInteraction"]
    offered[name] = { ...rest, ...(Object.keys(metadata).length ? { _meta: metadata } : {}) }
  }
  const currentSettings = settings()
  const ai = Object.fromEntries(AI_SETTING_KEYS.map((key) => [key, currentSettings[key]]))
  registerPersonalMcpTools(server, offered, {
    command: "max",
    messenger: maxMessenger,
    defaults: {
      limit: defaultLimit,
      history: history ?? settings().keepFailedRuns,
      guard: PASS,
      settings: {
        ...ai,
        profile,
        configured: ai,
        shared: { ...ai, speechModel: transcribeModel },
        get permissions() {
          return settings().permissions
        },
      },
      env: process.env,
      ...(embedders ? { embedders } : {}),
    },
    confirmed,
    resolveChat: (adapter, reference) => {
      const client = adapters.get(adapter)
      if (!client) throw new Error("MAX confirmation requires its held adapter")
      return client.chats.show(reference)
    },
    confirms: needsForm,
    around: inScope,
    session: {
      use: (name, work) =>
        session.use(name, async (client, release) => {
          let opened: ReturnType<typeof openStore> | undefined
          const account = {
            provider: "max",
            get account() {
              const id = store.readState().viewerId
              if (!id) throw new CliError("authentication_error", `no MAX account known for profile ${profile}`)
              return id
            },
          }
          const adapter = stored(adapterFor(client), {
            account,
            store: () => (opened ??= openStore()),
            warn,
            events: () => {},
          })
          adapters.set(adapter, client)
          try {
            return await work(adapter, release)
          } finally {
            remember()
            if (opened)
              await opened.then(
                (store) => store.close(),
                () => {},
              )
          }
        }),
    },
    withStore: (work, { name }) =>
      session.local(name, async () => {
        const account = store.readState().viewerId
        if (!account) throw new CliError("authentication_error", `no MAX account known for profile ${profile}`)
        const opened = await openStore()
        try {
          return await work(opened, { provider: "max", account })
        } finally {
          await opened.close()
        }
      }),
    withServices: (work, { name }) =>
      session.use(name, (client, release) =>
        withShared(
          client,
          { store, profile, warn },
          async (services) => {
            remember()
            return work(services, async (read) => {
              try {
                return await read(adapterFor(client))
              } finally {
                await release()
              }
            })
          },
          name === "mcp messages link" ? { reads: "store" } : { login: true },
        ),
      ),
  })
  const moderation = definitions.chats_moderate
  const level = levelFor(settings().permissions, "chats.moderate").level
  if (moderation && ["allow", "ask"].includes(level))
    registerLegacyCheck(server, session, {
      store,
      profile,
      allowDangerous,
      yes,
      confirmSend,
      scope: (work) => inScope("chats_moderate", moderation, work),
    })

  server.registerTool(
    "max_status",
    {
      title: "This server's profile and login",
      description:
        "The profile, known account and offered writes. Reads local state only; never connects or prints a token.",
      inputSchema: toStandardJsonSchema(v.strictObject({})),
      annotations: { ...READ, idempotentHint: true },
    },
    async () => {
      try {
        const account = store.readState().viewerId ?? null
        let token: string
        try {
          token = store.tokenSource() ?? "none"
        } catch {
          token = "unreachable"
        }
        return answerMcpTool({
          profile,
          account,
          viewerId: account,
          kind: store.isBot() ? "personal + bot" : "personal",
          token,
          loggedInHere: store.hasLoggedIn(),
          hasToken: store.readToken() !== undefined,
          hasLoggedIn: account !== null,
          writes: [
            ...Object.entries(offered)
              .filter(([, one]) => one.annotations.readOnlyHint !== true)
              .map(([name]) => `max_${name}`),
            ...(["allow", "ask"].includes(level) ? ["max_chats_check"] : []),
          ],
          confirmSend,
          permissions: settings().permissions,
        })
      } catch (error) {
        return failMcpTool(error)
      }
    },
  )
}
