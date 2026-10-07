import { CliError } from "@leemour/cli-core"
import {
  AI_SETTING_KEYS,
  type PersonalMcpDefaults,
  type PersonalMcpRegistration,
  type PersonalMcpTool,
  personalMcpCommand,
  personalMcpToolKey,
  personalMcpTools,
  registerPersonalMcpSurface,
  rememberAccount,
  stored,
} from "@leemour/cli-messaging/cli"
import { levelFor, type Permission } from "@leemour/cli-messaging/sends"
import { openStore } from "@leemour/cli-messaging/store"
import type { McpServer } from "@modelcontextprotocol/server"
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
import { legacyCheckTool } from "./legacy-check.js"
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
}

export const registerTools = (
  server: McpServer,
  session: MaxSession,
  {
    store,
    defaultLimit,
    history,
    profile,
    permission,
    transcribeModel = DEFAULT_MODEL,
    warn = () => {},
    reach,
    embedders,
  }: Options,
): void => {
  const settings = () => resolveSettings({ profile, permission })
  const adapters = new WeakMap<object, MaxClient>()
  const definitions = personalMcpTools(maxMessenger)
  for (const name of Object.keys(definitions)) if (name.startsWith("topics_")) delete definitions[name]
  const rules = definitions.chats_rules_show
  if (rules) definitions.chats_rules = { ...rules, key: "chats.rules.show" }

  const keyOf = (name: string, definition: PersonalMcpTool) =>
    name === "status" ? null : (personalMcpToolKey(name, definition) ?? "messages")
  const writable = (name: string, definition: PersonalMcpTool) => {
    const key = keyOf(name, definition)
    if (key === null) return null
    const own = settings()
    assertReadable(own, key)
    if (definition.annotations.readOnlyHint !== true && levelFor(own.permissions, key).level === "readonly")
      throw new CliError("permission_error", `profile ${profile} does not let ${key} write`, { permission: key })
    return key
  }
  const inScope: NonNullable<PersonalMcpRegistration["around"]> = (name, definition, work) => {
    const key = writable(name, definition)
    if (key === null) return work()
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
      const key = keyOf(name, definition)
      const level = key === null ? "allow" : levelFor(settings().permissions, key).level
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
  for (const [name, definition] of Object.entries(offered)) {
    if (!definition._meta) continue
    const metadata = { ...definition._meta }
    delete metadata["anthropic/requiresUserInteraction"]
    offered[name] = { ...definition, _meta: metadata }
  }
  const moderation = definitions.chats_moderate
  const level = levelFor(settings().permissions, "chats.moderate").level
  if (moderation && ["allow", "ask"].includes(level))
    offered.chats_check = legacyCheckTool(session, {
      store,
      profile,
      allowDangerous: false,
      yes: true,
      confirmSend: false,
      scope: (work) => inScope("chats_moderate", moderation, work),
    })
  offered.status = {
    title: "This server's profile and login",
    description:
      "The profile, known account and offered writes. Reads local state only; never connects or prints a token.",
    key: null,
    input: v.strictObject({}),
    annotations: { ...READ, idempotentHint: true },
    local: async () => {
      const account = store.readState().viewerId ?? null
      let token: string
      try {
        token = store.tokenSource() ?? "none"
      } catch {
        token = "unreachable"
      }
      return {
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
            .map(([name]) => personalMcpCommand(name)),
        ],
        permissions: settings().permissions,
      }
    },
  }
  const currentSettings = settings()
  const ai = Object.fromEntries(AI_SETTING_KEYS.map((key) => [key, currentSettings[key]]))
  registerPersonalMcpSurface(server, offered, {
    command: "max",
    messenger: maxMessenger,
    defaults: {
      limit: defaultLimit,
      history: history ?? settings().keepFailedRuns,
      guard: PASS,
      settings: {
        ...ai,
        profile,
        searchCatchUp: currentSettings.searchCatchUp,
        configured: ai,
        shared: { ...ai, speechModel: transcribeModel },
        get permissions() {
          return settings().permissions
        },
      },
      env: process.env,
      ...(embedders ? { embedders } : {}),
    },
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
}
