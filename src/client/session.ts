import { CliError } from "@wirecat/cli-base"
import { toChat, toContact, toProfile } from "../domain/map.js"
import type { Id } from "../domain/models.js"
import type { Invoke, wireClient } from "../generated/client.generated.js"
import { asFirstWord } from "../profile.js"
import type { Wire } from "../protocol/connection.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { MaxRecord, SyncSummary } from "../record.js"
import { LOGIN_CHATS, startSession } from "../session/handshake.js"
import { type SessionStore, withLoginRefused, withoutLoginPause } from "../session/store.js"
import { WEB_USER_AGENT } from "../spec/identity.js"
import type { WarningCode } from "../wire-events.js"
import {
  asArray,
  asCliError,
  asMarker,
  CHATS_PAGE_SEEN,
  eventTime,
  type ResumeFrom,
  reasonOf,
  record,
  refuseWhilePaused,
} from "./values.js"

interface Dependencies {
  readonly offline: boolean
  readonly store: SessionStore
  readonly fullLogin: boolean
  readonly connection: Wire
  readonly invoke: Invoke
  readonly resume: ResumeFrom | undefined
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "session">
  warnAbout: (code: WarningCode, message: string, extra?: { operation?: string; detail?: string }) => void
  readonly record: MaxRecord | undefined
  readonly server: { readonly journals: boolean } | undefined
  readonly now: () => number
}

export const createSession = (deps: Dependencies) => {
  let login: Payload | undefined
  let chatsCut: boolean = false
  let chatsComplete: boolean = false
  let merged: SyncSummary | undefined

  let connecting: Promise<void> | undefined
  let closed = false
  const connect = (options: { token?: string } = {}): Promise<void> => {
    if (closed) return Promise.reject(new CliError("network_error", "the client is closed"))
    if (!connecting)
      connecting = performConnect(options)
        .catch((error: unknown) => {
          login = undefined
          throw error
        })
        .finally(() => {
          connecting = undefined
        })
    return connecting
  }

  async function performConnect({ token: candidate }: { token?: string } = {}): Promise<void> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads through the shared store; it cannot connect to MAX")
    const token = candidate ?? deps.store.readToken()
    if (!token) {
      const profile = deps.store.profile
      // cli-base swallows a keyring that will not open, so the state file is the only witness: a
      // profile that has logged in lost its keyring, not its session, and another login would
      // register one more device for nothing (MAX-50, measured from cron 2026-09-25).
      if (deps.store.hasLoggedIn()) {
        throw new CliError(
          "authentication_error",
          `no token found for profile "${profile}", although it has logged in on this machine — ` +
            `the keyring is probably out of reach (cron, ssh: set XDG_RUNTIME_DIR); ` +
            `\`max ${asFirstWord(profile)}doctor\` shows it. Log in again only if the token was removed`,
        )
      }
      if (deps.store.isBot()) {
        throw new CliError(
          "authentication_error",
          `profile "${profile}" is a bot — its commands are \`max ${asFirstWord(profile)}bot …\`; ` +
            `\`max ${asFirstWord(profile)}session start\` would add a personal account to it`,
        )
      }
      // The fix has to carry the profile, or it logs the wrong one in: a name nobody has logged
      // in under is the ordinary shape of this failure now that the first word is the profile.
      throw new CliError(
        "authentication_error",
        `no session for profile "${profile}" — run \`max ${asFirstWord(profile)}setup\` in a local terminal; agents: read \`max skill show\``,
      )
    }

    const state = deps.store.readState()
    refuseWhilePaused(state)

    const sync = deps.fullLogin ? undefined : await loginMarker()

    try {
      await deps.connection.open()
      if (closed) throw new CliError("network_error", "the client is closed")
      const answer = await startSession(deps.invoke, {
        token,
        deviceId: state.deviceId,
        ...(sync === undefined ? {} : { sync }),
        ...(deps.resume ? { resume: deps.resume.login } : {}),
      })
      login = answer
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code !== "rate_limited") throw failure
      const paused = withLoginRefused(state)
      deps.store.writeState(paused)
      throw new CliError(
        "rate_limited",
        `${failure.message} — this profile will not log in again before ${paused.loginPausedUntil}; ` +
          "logging in sooner is what keeps an account locked",
      )
    }

    // MAX has counted this login by now, so its state and rotated token are kept even when the client
    // closed meanwhile; dropping them would make the next run log in again.
    const viewerId = toProfile(record(login.profile) ?? {}).id

    // **Before `writeState`**, so a login we are about to refuse does not count itself or move
    // `lastLoginAt`. A profile is a person, not a directory name: if this token belongs to someone
    // else, every later command in this process would send as them and nothing would say so.
    // Switching accounts has a door already — `session end` clears the id along with the token.
    if (viewerId && state.viewerId && viewerId !== state.viewerId) {
      throw new CliError(
        "authentication_error",
        `this token is for a different account than profile "${deps.store.profile}" was set up with — ` +
          `run \`max ${asFirstWord(deps.store.profile)}session end\` first if you meant to switch`,
      )
    }

    deps.store.writeState({
      ...withoutLoginPause(state),
      ...(viewerId ? { viewerId } : {}),
      logins: state.logins + 1,
      lastLoginAt: new Date(deps.now()).toISOString(),
    })

    keepRotatedToken(token)
    // `max serve` hands this login to any process that asks its socket; none of them needs the token.
    const { token: _, ...withoutToken } = login
    login = withoutToken
    if (closed) throw new CliError("network_error", "the client is closed")
    if (deps.resume) mergeChanged(deps.resume.chats)
    else await readRestOfChats()
    await mergeLogin(viewerId)
    if (closed) throw new CliError("network_error", "the client is closed")
  }

  async function connectOnce(): Promise<void> {
    if (closed) throw new CliError("network_error", "the client is closed")
    if (connecting) await connecting
    else if (!login) await connect()
  }

  function mergeChanged(before: Payload[]): void {
    const session = snapshot()
    const changed = asArray(session.chats)
    const ids = new Set(changed.map((chat) => asId(record(chat)?.id)))
    const kept = before.filter((chat) => !ids.has(asId(chat.id)))
    session.chats = [...changed, ...kept].sort((a, b) => eventTime(b) - eventTime(a))
  }

  async function readRestOfChats(): Promise<void> {
    chatsCut = false
    chatsComplete = false
    const session = snapshot()
    const chats = asArray(session.chats)
    const marker = record(chats.at(-1))?.lastEventTime
    if (chats.length < LOGIN_CHATS) {
      chatsComplete = true
      return
    }
    if (typeof marker !== "number" && typeof marker !== "bigint") return

    try {
      const answer = await deps.wire.chats.list({ marker: Number(marker) })
      const known = new Set(chats.map((chat) => asId(record(chat)?.id)))
      const rest = asArray(answer.chats).filter((chat) => !known.has(asId(record(chat)?.id)))
      session.chats = [...chats, ...rest]
      chatsCut = rest.length >= CHATS_PAGE_SEEN
      chatsComplete = !chatsCut
    } catch (error) {
      chatsCut = true
      deps.warnAbout("chats_partial", `only the newest ${chats.length} chats were read: ${reasonOf(error)}`)
    }
  }

  function keepRotatedToken(sent: string): void {
    const rotated = snapshot().token
    if (typeof rotated !== "string" || rotated === "" || rotated === sent) return
    if (fromEnvironment()) {
      deps.warnAbout(
        "token_not_saved",
        "MAX refreshed the session; the fresh token was not saved, because the one in use came from MAX_TOKEN",
      )
      return
    }

    try {
      deps.store.writeToken(rotated)
    } catch (error) {
      deps.warnAbout(
        "token_not_saved",
        `the refreshed session could not be saved, so the previous one is still in use: ${reasonOf(error)}`,
      )
    }
  }

  async function mergeLogin(viewerId: string | undefined): Promise<void> {
    const marker = asMarker(snapshot().time)
    if (!deps.record) return

    const chats = asArray(snapshot().chats)
    const members = new Map<Id, Id[]>()
    for (const raw of chats) {
      const chat = toChat(raw)
      // A channel lists four of its hundred and seventy-eight thousand subscribers, so its
      // `participants` is not a membership — storing it would be storing a wrong answer.
      if (!chat.id || chat.kind === "channel") continue
      const participants = participantsOf(raw, viewerId)
      if (participants !== undefined) members.set(chat.id, participants)
    }

    const delta = {
      chats: chats.map(toChat).filter((chat) => chat.id !== ""),
      people: asArray(snapshot().contacts)
        .map(toContact)
        .filter((contact) => contact.id !== ""),
      members,
    }
    // A login `max serve` made answered its own marker, not the record's: what changed before it is not in it.
    const own = deps.server?.journals !== true
    await keep("login", async (record) => {
      const summary = await record.applyLogin({ ...delta, ...(own && marker !== undefined ? { marker } : {}) })
      merged = summary
    })
  }

  async function loginMarker(): Promise<number | undefined> {
    let marker: number | undefined
    await keep("marker", async (record) => {
      marker = await record.syncMarker()
    })
    return marker
  }

  async function keep(what: string, write: (record: MaxRecord) => Promise<void>): Promise<void> {
    if (!deps.record) return
    try {
      await write(deps.record)
    } catch (error) {
      deps.warnAbout("cache_not_written", `the local store did not take the ${what}: ${reasonOf(error)}`)
    }
  }

  function participantsOf(chat: Payload, viewerId: string | undefined): Id[] | undefined {
    const participants = record(chat.participants)
    return participants === undefined ? undefined : Object.keys(participants).filter((id) => id !== viewerId)
  }

  async function logout(): Promise<void> {
    if (deps.offline) throw new CliError("validation_error", "`--offline` cannot log out on MAX's side")
    await connectOnce()
    await deps.wire.session.logout({})
  }

  async function close(): Promise<void> {
    closed = true
    await deps.connection.close()
  }

  async function beforeLogin(flow: () => Promise<string>): Promise<string> {
    try {
      await deps.connection.open()
    } catch (error) {
      throw asCliError(error)
    }
    await deps.wire.session.init({ userAgent: WEB_USER_AGENT, deviceId: deps.store.readState().deviceId })
    return await flow()
  }

  function fromEnvironment(): boolean {
    try {
      return deps.store.tokenSource() === "environment"
    } catch {
      return false
    }
  }

  function keepSettings(sent: { user?: Payload; chats?: Payload }, answer: Payload): void {
    const login = snapshot()
    const config = record(login.config) ?? {}
    login.config = {
      ...config,
      ...(typeof answer.hash === "string" ? { hash: answer.hash } : {}),
      ...(sent.user ? { user: { ...(record(config.user) ?? {}), ...sent.user, ...(record(answer.user) ?? {}) } } : {}),
      ...(sent.chats ? { chats: { ...(record(config.chats) ?? {}), ...sent.chats } } : {}),
    }
  }

  function lastEventOf(chatId: Id): number {
    const chat = asArray(snapshot().chats).find((one) => asId(one.id) === chatId)
    return eventTime(chat) || deps.now()
  }

  function snapshot(): Payload {
    if (!login) throw new CliError("configuration_error", "connect() was never called")
    return login
  }
  return {
    connect: connect,
    connectOnce: connectOnce,
    keep: keep,
    participantsOf: participantsOf,
    logout: logout,
    close: close,
    beforeLogin: beforeLogin,
    fromEnvironment: fromEnvironment,
    keepSettings: keepSettings,
    lastEventOf: lastEventOf,
    session: () => {
      if (connecting) throw new CliError("configuration_error", "the login is still initializing")
      return snapshot()
    },
    get login() {
      return connecting ? undefined : login
    },
    set login(value: Payload | undefined) {
      login = value
    },
    get chatsCut() {
      return chatsCut
    },
    get chatsComplete() {
      return chatsComplete
    },
    get merged() {
      return merged
    },
  }
}
