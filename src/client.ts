import { CliError, realSleep, type SleepLike } from "@leemour/cli-core"
import { pickPerson as pickStoredPerson } from "@leemour/cli-messaging"
import { type DiagnosticEvent, providerErrorKey } from "@leemour/cli-messaging/cli"
import {
  type AccountAction,
  type ChatAction,
  currentOperation,
  type GuardRequest,
  type SendGuard,
  type Upload as SharedUpload,
} from "@leemour/cli-messaging/sends"
import { delayMs } from "./config.js"
import {
  namesFrom,
  POLL_CLOSED,
  pollSettings,
  SETTING_FLAGS,
  toCallRecord,
  toChat,
  toContact,
  toFolder,
  toGroupCard,
  toGroupMember,
  toMessage,
  toPoll,
  toPrivacy,
  toProfile,
  toProfileFacts,
  toReactions,
  toSession,
} from "./domain/map.js"
import type {
  AccountSession,
  AttachmentLink,
  CallRecord,
  Chat,
  ChatCard,
  ChatEvents,
  ChatKind,
  Contact,
  ContactImport,
  Deletion,
  Folder,
  GroupCard,
  GroupMember,
  GroupMembers,
  GroupSettings,
  Id,
  MediaKind,
  Message,
  MessageChange,
  MessageHit,
  Page,
  PersonCard,
  Pin,
  Poll,
  PollMessage,
  PrivacySettings,
  Profile,
  ProfileFacts,
  QuotedMessage,
  Reactions,
  ReadMark,
  WindowedMessage,
} from "./domain/models.js"
import { type Invoke, wireClient } from "./generated/client.generated.js"
import { type Markup, parseMarkdown } from "./markdown.js"
import { asFirstWord } from "./profile.js"
import { Connection, ProtocolError, type Wire } from "./protocol/connection.js"
import { asId, type Payload } from "./protocol/frame.js"
import type { MaxRecord, SyncSummary } from "./record.js"
import { isId, pickChat } from "./resolve.js"
import { LOGIN_CHATS, type Resume, startSession } from "./session/handshake.js"
import { type QrLogin, tokenByQr } from "./session/login.js"
import {
  loginPausedUntil,
  type SessionState,
  type SessionStore,
  withLoginRefused,
  withoutLoginPause,
} from "./session/store.js"
import { WEB_USER_AGENT } from "./spec/identity.js"
import { buildRequest, checkResponse, type Operation, type RequestOf } from "./spec/index.js"
import { ASSET_TYPES } from "./spec/operations/assets.js"
import type { chatsUpdateMembers } from "./spec/operations/chats.js"
import { isImage, isVideo, readUpload, uploadFile, uploadMedia, uploadPhoto } from "./upload.js"
import { voiceOf } from "./voice.js"
import { countsIn, idsOf, type WarningCode } from "./wire-events.js"

/** One file on its way into a message; `voice` is what a voice message carries besides the bytes. */
interface Upload {
  path: string
  bytes: Buffer
  kind: "photo" | "video" | "file" | "voice"
  voice?: { durationMs: number; wave: Uint8Array }
}

export interface MaxClientOptions {
  store: SessionStore
  timeoutMs?: number
  /** Injected by tests, or one through `max serve`; defaults to a real WebSocket connection. */
  connection?: Wire
  /**
   * Log in without the saved contact marker, so the answer names every contact. `max serve` needs that: it hands its login to other commands as theirs.
   */
  fullLogin?: boolean
  /** The previous connection's login, for logging in again as a web tab does (`MAX-51`). `max serve` only. */
  resume?: ResumeFrom
  /**
   * Where a protocol note goes. Never stdout: in machine mode that stream carries one JSON value
   * and nothing else.
   */
  warn?: (message: string) => void
  /** What the login brings, kept in the shared `messages.db`. */
  record?: MaxRecord
  /** Refuse network use; the shared services own offline reads. */
  offline?: boolean
  /**
   * One event per request, for whoever is keeping a diagnostic. Injected the way `warn` is: the
   * client reports what it did and never decides where that goes. Absent means nothing is kept.
   */
  events?: (event: DiagnosticEvent) => void
  /**
   * Asked before every send and told its outcome. `"caller"` when whoever holds the client guards
   * its writes instead: the shared services, or `max serve` for each write it forwards.
   * Required, so a client without a guard is a choice somebody wrote and never one they forgot.
   */
  sends: SendGuard | "caller"
  reads?: (key: string) => void
  /** The wait between retries; a test passes one that returns at once. */
  sleep?: SleepLike
}

/**
 * **The only thing above this line that knows MAX exists.** Commands speak the domain model; the
 * opcodes and the frames stop here, so a different transport underneath changes this file and
 * nothing else (REQUIREMENTS §25).
 *
 * The methods are grouped by subject — `client.chats.list()`, `client.messages.send()` — which is
 * the shape §8 sketched. **There is only this door.** The generated per-operation wrappers sit
 * underneath and stay internal: they return raw MAX payloads, without the resend rule, the name
 * filling or the id conversion that make this safe to point at a real account (`NEED-34`).
 *
 * One instance is one connection. `open` then `close`, always in a `finally`.
 */
export class MaxClient {
  readonly #store: SessionStore
  readonly #connection: Wire
  readonly #fullLogin: boolean
  readonly #resume: ResumeFrom | undefined
  readonly #warn: (message: string) => void
  readonly #record: MaxRecord | undefined
  readonly #offline: boolean
  readonly #events: (event: DiagnosticEvent) => void
  readonly #sleep: SleepLike
  readonly #sends: SendGuard | undefined
  readonly #invoke = ((operation, request) => this.#send(operation, request)) as Invoke
  readonly #wire = wireClient(this.#invoke)
  readonly #appliedOperations = new Set<string>()
  #login: Payload | undefined
  #chatsCut = false
  /** Every chat the account is in: only then may a chat absent from the list be marked as left. */
  #chatsComplete = false
  #previousCid = 0
  #people: Map<Id, Contact> | undefined
  #merged: SyncSummary | undefined

  constructor({
    store,
    timeoutMs,
    connection,
    warn,
    record,
    offline = false,
    events,
    sleep,
    sends,
    reads,
    fullLogin = false,
    resume,
  }: MaxClientOptions) {
    this.#store = store
    this.#fullLogin = fullLogin
    this.#resume = resume
    this.#connection = connection ?? new Connection(timeoutMs === undefined ? {} : { timeoutMs })
    this.#warn = warn ?? ((message) => process.stderr.write(`${message}\n`))
    this.#record = record
    this.#offline = offline
    this.#events = events ?? (() => {})
    this.#sleep = sleep ?? realSleep
    this.#sends = sends === "caller" ? undefined : sends
    if (reads) {
      const aliases: Record<string, string> = {
        "account.me": "account.show",
        "account.sessions": "account.sessions.list",
        "account.endOtherSessions": "account.sessions.end",
        "chats.markRead": "chats.mark-read",
        "chats.adminIds": "chats.admins.list",
        "chats.since": "messages.list",
        "messages.around": "messages.context",
        "messages.react": "reactions.add",
        "messages.unreact": "reactions.remove",
        "contacts.sync": "contacts.list",
      }
      const gated = <T extends object>(resource: string, methods: T): T =>
        new Proxy(methods, {
          get: (target, key, receiver) => {
            const value: unknown = Reflect.get(target, key, receiver)
            const path = `${resource}.${String(key)}`
            if (typeof value === "object" && value !== null) return gated(path, value)
            return typeof value === "function"
              ? (...args: unknown[]) => {
                  if (
                    path !== "messages.moment" &&
                    !(path === "chats.resolve" && typeof args[0] === "string" && isId(args[0]))
                  ) {
                    const actual =
                      path === "messages.pin" && args[1] === null ? "messages.unpin" : (aliases[path] ?? path)
                    reads(actual)
                  }
                  return Reflect.apply(value, target, args)
                }
              : value
          },
        })
      this.account = gated("account", this.account)
      this.chats = gated("chats", this.chats)
      this.contacts = gated("contacts", this.contacts)
      this.messages = gated("messages", this.messages)
      this.polls = gated("polls", this.polls)
      this.folders = gated("chats.folders", this.folders)
    }
  }

  readonly account = {
    me: async (): Promise<Profile> => {
      await this.#connectOnce()
      return toProfile(record(this.#session().profile) ?? {})
    },

    /** What the login carried: MAX sends the account's settings with it, so reading them asks nothing more. */
    privacy: async (): Promise<PrivacySettings> => {
      await this.#connectOnce()
      return toPrivacy(record(record(this.#session().config)?.user) ?? {})
    },

    /** Newest first. The web tab asks the same with the sync value it last kept; 0 is the whole history. */
    calls: async (limit: number): Promise<Page<CallRecord>> => {
      await this.#connectOnce()
      const answer = await this.#wire.calls.history({ callHistorySync: 0 })
      const self = asId(record(record(this.#session().profile)?.contact)?.id)
      const calls = asArray(answer.callHistoryItems)
        .map((raw) => toCallRecord(record(raw) ?? {}, self))
        .sort((a, b) => b.at.localeCompare(a.at))
      return { items: calls.slice(0, limit), hasMore: calls.length > limit }
    },

    /**
     * Changes the profile everyone sees. **The name goes out whole**: the web client always sends
     * the current first name, so a change to the description alone keeps it from the login.
     */
    update: (change: ProfileChange): Promise<Profile> =>
      this.#change("profile", async () => {
        const current = ownNames(record(this.#session().profile) ?? {})
        const firstName = change.firstName ?? current.firstName
        if (!firstName)
          throw new CliError("validation_error", "MAX needs a first name, and the profile has none — pass --first-name")
        const lastName = change.lastName ?? current.lastName

        const photoToken =
          change.photo === undefined ? undefined : await this.#photoToken(change.photo, { profile: true })
        const answer = await this.#wire.account.update({
          firstName,
          ...(lastName === undefined ? {} : { lastName }),
          ...(change.description === undefined ? {} : { description: change.description }),
          ...(photoToken === undefined ? {} : { photoToken, avatarType: "USER_AVATAR" as const }),
        })
        return toProfile(record(answer.profile) ?? {})
      }),

    sessions: async (): Promise<AccountSession[]> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded, and sessions are not recorded")
      await this.#connectOnce()
      return asArray((await this.#wire.account.sessions({})).sessions).map(toSession)
    },

    /**
     * Logs every other device out — the owner's phone included — and keeps this one.
     *
     * PyMax reads a replacement token from the answer and the web client reads nothing (`RISK-25`),
     * so both are handled: a token that came back is stored before anything is reported, and then
     * the session is asked for once more, so a MAX that ended this one too says so here rather
     * than on the next command.
     */
    endOtherSessions: (): Promise<AccountSession[]> =>
      this.#change("sessions-end", async (done) => {
        const answer = await this.#wire.account.closeSessions({})
        // The other devices are out from here on, whatever follows fails: the journal says so.
        done()
        const token = answer.token
        if (typeof token === "string" && token !== "" && this.#fromEnvironment()) {
          this.#warnAbout(
            "token_not_saved",
            "MAX gave this session a new token, and it was not saved: the one in use came from MAX_TOKEN — " +
              "if MAX_TOKEN stops working, log in again and set it anew",
          )
        } else if (typeof token === "string" && token !== "") {
          try {
            this.#store.writeToken(token)
          } catch (error) {
            throw new CliError(
              "configuration_error",
              `the other sessions are ended, but the new token for this one could not be saved: ${reasonOf(error)} — run \`max session start\``,
            )
          }
        }

        try {
          return asArray((await this.#wire.account.sessions({})).sessions).map(toSession)
        } catch (error) {
          throw new CliError(
            "authentication_error",
            `the other sessions are ended, and MAX no longer answers this one (${asCliError(error).message}) — run \`max session start\``,
          )
        }
      }),
  }

  /**
   * Obtaining a token rather than using one. The token comes back to the caller, unstored and not yet
   * tried: `adoptToken` logs in with it on a connection of its own before the keyring sees it, so
   * a login that went wrong halfway cannot replace a working session.
   */
  readonly login = {
    byQr: (options: QrLogin): Promise<string> => this.#beforeLogin(() => tokenByQr(this.#wire, options)),
  }

  readonly chats = {
    /**
     * Chats come with the login; a limit trims rather than fetching more.
     *
     * **A one-to-one chat has no title of its own** — its name is the other person's, which MAX
     * does not put in the chat object. So the partner is looked up once, for every dialog at a
     * time, and the name is filled in. Without this, `max chats` shows a column of blanks for
     * exactly the chats a person recognises by name.
     */
    list: async (options: PageRequest = {}): Promise<Page<Chat>> => {
      const { limit, offset = 0, kind, unread } = options
      const query = checkedQuery(options.query)

      await this.#connectOnce()
      const raw = asArray(this.#session().chats)
      const people = await this.#peopleFor(raw)

      // A one-to-one chat has no title of its own — its name is the other person's, and MAX does
      // not put it in the chat object. Without this, the chats a person recognises by name are a
      // column of blanks.
      const chats = raw.map((chat) => {
        const mapped = toChat(chat)
        if (mapped.kind !== "dialog") return mapped

        const partner = this.#partnerOf(chat)
        const named = partner === undefined ? mapped : { ...mapped, providerMetadata: { partnerId: partner } }
        if (mapped.title !== null) return named
        return { ...named, title: partner === undefined ? null : (people.get(partner)?.name ?? null) }
      })

      let known = chats
      await this.#keep("chats", async (record) => {
        known = await record.rememberChats(chats, this.#chatsComplete)
      })
      const partners = new Map(chats.map((chat) => [chat.id, chat.providerMetadata]))
      const page = paged(
        matching(
          known.map((chat) => ({
            ...chat,
            ...(partners.get(chat.id) ? { providerMetadata: partners.get(chat.id) } : {}),
          })),
          { query, kind, unread },
        ),
        limit,
        offset,
      )
      // MAX holds chats it did not send; the last nonempty page says so, and an empty one ends a paging script.
      return this.#chatsCut && page.items.length > 0 ? { ...page, hasMore: true } : page
    },

    /**
     * Turns what the person typed into a chat id.
     *
     * A number is taken as an id. Anything else is matched against chat titles, exactly first and
     * then as a fragment — and **an ambiguous name is an error, not a guess**: sending to the wrong
     * conversation is not undoable, so the caller is shown the candidates and asked to be specific.
     */
    resolve: async (reference: string): Promise<Id> => {
      if (isId(reference)) return reference.trim()
      return pickChat(reference, (await this.chats.list()).items).id
    },

    /**
     * One chat and who is in it, from the list the login just refreshed.
     *
     * ⚠ **An id is checked here, where `resolve` lets any number through** — for a read that is
     * the difference between an answer and a card of nulls for a chat that does not exist.
     */
    show: async (reference: string): Promise<ChatCard> => {
      const { items } = await this.chats.list()
      const chat = isId(reference) ? items.find((one) => one.id === reference.trim()) : pickChat(reference, items)
      if (!chat) throw new CliError("not_found", `no chat ${reference.trim()} among this account's chats`)

      let members: ChatCard["members"] = null
      if (chat.kind !== "channel")
        await this.#keep("members", async (record) => {
          members = await record.members(chat.id)
        })
      // The login carries only the chats that changed lately; the settings of the rest are not known here.
      const raw =
        this.#offline || chat.kind === "dialog"
          ? undefined
          : asArray(this.#session().chats).find((one) => asId(one.id) === chat.id)
      const card = raw ? toGroupCard(raw) : undefined
      return {
        ...chat,
        members,
        description: card?.description ?? null,
        access: card?.access ?? null,
        settings: card?.settings ?? null,
      }
    },

    /** The other person in a one-to-one chat, by the chat's participants; `undefined` for anything else. */
    partner: async (chatId: Id): Promise<Id | undefined> => {
      await this.#connectOnce()
      const raw = asArray(this.#session().chats).find((chat) => asId(chat.id) === chatId)
      return raw ? this.#partnerOf(raw) : undefined
    },

    /**
     * The owner and admins of a group, from the chat as the login carried it (`owner`, `admins`,
     * `adminParticipants` — measured 2026-09-24, `FIND-116`). `undefined` when the login did not
     * carry this chat or its admins: the login carries only chats that changed lately, and the rest
     * come from the local copy.
     */
    adminIds: async (chatId: Id): Promise<Id[] | undefined> => {
      const roles = await this.#roles(chatId)
      return roles && [...new Set([...(roles.owner ? [roles.owner] : []), ...roles.admins])]
    },

    /**
     * Who joined, left, was added or removed since a point: the service messages in the chat's
     * history, read forward from `since` without reactions. At most `EVENTS_READ` messages, the oldest.
     */
    events: async (
      reference: string,
      { since = Date.now() - EVENTS_DAYS * 86_400_000 }: { since?: number } = {},
    ): Promise<ChatEvents> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` has no history to read events from")
      const chatId = await this.chats.resolve(reference)
      const { messages: read, more } = await this.chats.since(chatId, since)

      const found = read.flatMap((message) =>
        message.attachments
          .filter((attachment) => attachment.kind === "control" && attachment.event !== undefined)
          .map((attachment) => ({ message, attachment })),
      )
      const contacts = namesFrom(this.#session().contacts)
      const ids = [
        ...new Set([
          ...found.flatMap(({ attachment }) => attachment.userIds ?? []),
          ...found.flatMap(({ message }) =>
            message.senderName === null && message.senderId ? [message.senderId] : [],
          ),
        ]),
      ]
      const names = await this.#namesOf(ids.filter((id) => !contacts.has(id)))
      const nameOf = (id: Id) => contacts.get(id) ?? names.get(id) ?? null

      return {
        chatId,
        since: new Date(since).toISOString(),
        more,
        events: found.map(({ message, attachment }) => ({
          messageId: message.id,
          timestamp: message.timestamp,
          event: attachment.event ?? "",
          by: { id: message.senderId, name: message.senderName ?? (message.senderId && nameOf(message.senderId)) },
          people: (attachment.userIds ?? []).map((id) => ({ id, name: nameOf(id) })),
          ...(attachment.title ? { title: attachment.title } : {}),
        })),
      }
    },

    /**
     * A chat's history after `since`, oldest first and without reactions, at most `EVENTS_READ`
     * messages; `more` when there was more than that.
     */
    since: async (chatId: Id, since: number): Promise<{ messages: Message[]; more: boolean }> => {
      const read: Message[] = []
      let from = since
      while (true) {
        const page = (
          await this.#history(chatId, { from, backward: 0, forward: HISTORY_PAGE + 1 }, { reactions: false })
        ).filter((message) => Date.parse(message.timestamp) > from)
        read.push(...page)
        const last = page.at(-1)
        if (page.length < HISTORY_PAGE || !last) return { messages: read, more: false }
        if (read.length >= EVENTS_READ) return { messages: read, more: true }
        from = Date.parse(last.timestamp)
      }
    },

    /** What a link leads to, without joining it. */
    inspect: async (link: string): Promise<GroupCard> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot read a link")
      const wire = wireLink(link)
      await this.#connectOnce()
      const answer = await this.#wire.chats.linkInfo({ link: wire }).catch(deadLink(link))
      return toGroupCard(record(answer.chat) ?? {})
    },

    join: (link: string): Promise<GroupCard> => {
      const wire = wireLink(link)
      return this.#changeChat(null, "join", async () => {
        const chat = toGroupCard(record((await this.#wire.chats.join({ link: wire }).catch(deadLink(link))).chat) ?? {})
        return { chatId: chat.id, result: chat }
      })
    },

    /**
     * Marks a chat read up to `messageId`, or up to its newest message. The one call here that
     * sends `CHAT_MARK`; nothing that reads does (REQUIREMENTS §19). The other person sees it, so it
     * passes the send guard like a pin, and is not retried.
     */
    markRead: async (chatId: Id, messageId?: Id): Promise<ReadMark> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot mark a chat read")
      await this.#guard({ chatId, kind: "read" }, messageId)

      try {
        await this.#connectOnce()
        const upTo =
          messageId ?? (await this.#history(chatId, { from: Date.now(), backward: 1, forward: 0 })).at(-1)?.id
        if (!upTo) throw new CliError("not_found", `chat ${chatId} has no messages to mark read`)
        // The web client's mark is the read message's own time, not the moment of reading: a later
        // one would mark newer messages read too (captured 2026-09-25, `RES-10`).
        const mark = timeOfMessageId(upTo)
        if (mark === undefined) throw new CliError("validation_error", `"${upTo}" is not a message id`)
        const answer = await this.#wire.chats.mark({ type: "READ_MESSAGE", chatId, messageId: upTo, mark })
        this.#sends?.record({ chatId, kind: "read", outcome: "sent", messageId: upTo })
        return { chatId, messageId: upTo, unread: typeof answer.unread === "number" ? answer.unread : null }
      } catch (error) {
        this.#sends?.record({ chatId, kind: "read", outcome: "failed", errorCode: asCliError(error).code })
        throw error
      }
    },

    leave: async (reference: string): Promise<ChatChange> => {
      const chatId = await this.chats.resolve(reference)
      return this.#changeChat(chatId, "leave", async () => {
        await this.#wire.chats.leave({ chatId })
        return { chatId, result: { chatId, action: "leave", people: [], chat: null } }
      })
    },

    /**
     * Not retried, unlike a message: a second attempt with a new `cid` is a second group, and
     * whether MAX deduplicates a creation by `cid` is not measured.
     */
    create: async (title: string, people: string[] = [], { channel = false } = {}): Promise<GroupCard> => {
      const userIds = await this.#personIds(people)
      return this.#changeChat(
        null,
        "create",
        async () => {
          const answer = await this.#wire.messages.send({
            message: {
              cid: this.#nextCid(),
              attaches: [{ _type: "CONTROL", event: "new", chatType: channel ? "CHANNEL" : "CHAT", title, userIds }],
            },
            notify: true,
          })
          const chat = toGroupCard(record(answer.chat) ?? {})
          return { chatId: chat.id, result: chat, people: userIds.length }
        },
        userIds,
      )
    },

    members: {
      /**
       * Everyone in a group or channel, from MAX, page by page. Paging follows PyMax: each answer's
       * `marker` asks for the next page, and none means the last. Stops at `MEMBERS_READ`, or when a
       * page repeats its marker or brings nobody new, so a misread marker cannot loop.
       */
      list: async (reference: string): Promise<GroupMembers> => {
        const {
          hasMore: _hasMore,
          truncated: _truncated,
          readCount: _readCount,
          ...found
        } = await this.#members(reference)
        return found
      },
      page: async (reference: string, window: { limit?: number; offset: number }) => {
        const {
          members: items,
          hasMore,
          chatId,
          rolesKnown,
          truncated,
          readCount,
        } = await this.#members(reference, window)
        return { items, hasMore, chatId, rolesKnown, truncated, readCount }
      },
      /** No history unless asked (`NEED-272`): what was said before somebody joined is not theirs by default. */
      add: (reference: string, people: string[], { history = false }: { history?: boolean } = {}) =>
        this.#updateMembers(reference, people, "members.add", { operation: "add", showHistory: history }),
      remove: (reference: string, people: string[]) =>
        this.#updateMembers(reference, people, "members.remove", { operation: "remove", cleanMsgPeriod: 0 }),
    },

    admins: {
      add: (reference: string, person: string, rights: AdminRight[]) =>
        this.#updateMembers(reference, [person], "admins.add", {
          operation: "add",
          type: "ADMIN",
          permissions: rights.reduce((sum, right) => sum | ADMIN_RIGHTS[right], 0),
        }),
      remove: (reference: string, person: string) =>
        this.#updateMembers(reference, [person], "admins.remove", { operation: "remove", type: "ADMIN" }),
    },

    update: async (
      reference: string,
      { title, description, photo }: { title?: string; description?: string; photo?: SharedUpload },
    ) => {
      if (title === undefined && description === undefined && photo === undefined) {
        throw new CliError("validation_error", "nothing to change — give --title, --description or --photo")
      }
      const chatId = await this.chats.resolve(reference)
      return this.#changeChat(chatId, "update", async () => {
        const photoToken = photo === undefined ? undefined : await this.#photoToken(photo, { profile: false })
        const answer = await this.#wire.chats.update({
          chatId,
          ...(title === undefined ? {} : { theme: title }),
          ...(description === undefined ? {} : { description }),
          ...(photoToken === undefined ? {} : { photoToken }),
        })
        return { chatId, result: toGroupCard(record(answer.chat) ?? {}) }
      })
    },

    /** With no changes, reads the settings the login carried; nothing is sent. */
    settings: async (reference: string, changes: Partial<GroupSettings> = {}): Promise<GroupCard> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; settings never are")
      const chatId = await this.chats.resolve(reference)
      const entries = Object.entries(changes).filter(([, value]) => value !== undefined)
      if (entries.length === 0) {
        await this.#connectOnce()
        const raw = asArray(this.#session().chats).find((chat) => asId(chat.id) === chatId)
        if (!raw) {
          const shown = await this.chats.show(chatId)
          return {
            ...shown,
            link: null,
            settings: shown.settings ?? {
              allCanPin: null,
              onlyAdminsAdd: null,
              onlyAdminsCall: null,
              onlyOwnerEditsInfo: null,
              membersSeeLink: null,
            },
          }
        }
        return toGroupCard(raw)
      }

      const options = Object.fromEntries(
        entries.map(([ours, value]) => [SETTING_FLAGS[ours as keyof GroupSettings], value as boolean]),
      )
      return this.#changeChat(chatId, "settings", async () => {
        const answer = await this.#wire.chats.update({ chatId, options })
        return { chatId, result: toGroupCard(record(answer.chat) ?? {}) }
      })
    },

    /** The old link stops working for everyone who has it. */
    resetLink: async (reference: string): Promise<GroupCard> => {
      const chatId = await this.chats.resolve(reference)
      return this.#changeChat(chatId, "link.reset", async () => {
        const answer = await this.#wire.chats.update({ chatId, revokePrivateLink: true })
        return { chatId, result: toGroupCard(record(answer.chat) ?? {}) }
      })
    },
  }

  readonly contacts = {
    /**
     * Finds whoever MAX has under a phone number. A lookup, not an add: nothing changes on the
     * account. ⚠ The number is never repeated in an error — it is the one field here the sixth
     * constraint is about.
     */
    lookup: async (phone: string): Promise<Contact> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot look a number up")
      const number = wirePhone(phone)
      await this.#connectOnce()
      const contact = record((await this.#wire.contacts.byPhone({ phone: number })).contact)
      if (!contact) throw new CliError("not_found", "MAX has nobody under that number")
      return this.#remember(toContact(contact))
    },

    add: (reference: string): Promise<Contact> => this.#contactAction("contact-add", { action: "ADD" }, reference),

    remove: (reference: string): Promise<Contact> =>
      this.#contactAction("contact-remove", { action: "REMOVE" }, reference),

    /** They can no longer write to you. Works for somebody who is not a contact too (measured). */
    block: (reference: string): Promise<Contact> =>
      this.#contactAction("contact-block", { action: "BLOCK" }, reference),

    unblock: (reference: string): Promise<Contact> =>
      this.#contactAction("contact-unblock", { action: "UNBLOCK" }, reference),

    /** A name of your own for them, kept beside the one they chose; they do not see it. */
    rename: (reference: string, firstName: string, lastName?: string): Promise<Contact> =>
      this.#contactAction("contact-rename", { action: "UPDATE", firstName, lastName: lastName ?? null }, reference),

    /** Uploads phone numbers to MAX — other people's — under the names they were saved with. */
    import: (entries: PhoneBookEntry[]): Promise<ContactImport> =>
      this.#change("contact-import", async () => {
        if (entries.length === 0) throw new CliError("validation_error", "no numbers to import")
        const contactList: Record<string, { firstName: string }> = {}
        for (const entry of entries) contactList[wirePhone(entry.phone)] = { firstName: entry.name }

        const answer = await this.#wire.contacts.import({ contactList })
        return {
          sent: Object.keys(contactList).length,
          recognised: Object.keys(record(answer.phones) ?? {}),
          contacts: await Promise.all(
            asArray(answer.contacts)
              .map(toContact)
              .map((contact) => this.#remember(contact)),
          ),
        }
      }),

    /**
     * One person and the chats we share, **whoever they are** — a group member is as findable as
     * a contact. `NEED-105` decides who `list` lists, not who can be looked up.
     *
     * Only from the store: the shared chats are its `chat_members`, which nothing else holds.
     */
    show: async (reference: string): Promise<PersonCard> => {
      const record = this.#record
      if (!record) throw new CliError("configuration_error", "no local store to look people up in")
      await this.#connectOnce()
      await this.#peopleFor(asArray(this.#session().chats))
      const person = await this.#person(reference)
      const chats = (await record.chatsWith(person.id)).map(({ id, title, kind, lastMessageAt }) => ({
        id,
        title,
        kind,
        lastMessageAt,
      }))
      return { ...person, chats }
    },

    /**
     * What MAX says about one person — one `CONTACT_INFO` — and the chats shared with them, from
     * the store as `show` reads them.
     */
    profile: async (reference: string): Promise<ProfileFacts> => {
      const card = await this.contacts.show(reference)
      const answer = await this.#wire.contacts.info({ contactIds: [card.id] })
      const raw = asArray(answer.contacts).find((one) => asId(one.id) === card.id)
      if (!raw) throw new CliError("not_found", `MAX did not describe person ${card.id}`)
      return toProfileFacts(raw, card.chats)
    },

    /**
     * **Start again from zero**: forget the marker, so this login asks for the whole collection
     * rather than for what changed, and name everybody it mentions.
     *
     * It is a repair tool, not the way contacts arrive. The delta rides on the login every command
     * already performs, so there is nothing to schedule and no budget to spend — what this is for
     * is a store that has drifted, or a full re-take after a schema rebuild threw the rows away.
     */
    sync: async (): Promise<SyncSummary & { full: true }> => {
      if (this.#offline) {
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot sync")
      }

      const record = this.#record
      if (!record) {
        throw new CliError(
          "configuration_error",
          `there is no local store for profile "${this.#store.profile}" to sync into — the note above says why`,
        )
      }

      // Before connecting, or the login would carry the marker this is meant to discard.
      await this.#keep("marker", (record) => record.forgetMarker())
      await this.#connectOnce()

      // The login names a fraction of the people in its own chats, so a full take that stopped
      // here would store ids without names for most of them.
      await this.#peopleFor(asArray(this.#session().chats))

      const known = (await record.people()).all().length
      return { ...(this.#merged ?? { known: 0, added: 0, changed: 0 }), known, full: true }
    },
  }

  readonly messages = {
    /**
     * The chat's queue of scheduled messages, soonest first. Read-only: cancelling is `MSG_DELETE`,
     * which nothing here sends. Never cached — the queue empties by itself as messages go out.
     */
    scheduled: async (chatId: Id): Promise<Message[]> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` has no record of the queue; it lives on MAX")
      await this.#connectOnce()
      const session = this.#session()
      const answer = await this.#wire.chats.history({
        chatId,
        from: 1,
        forward: 100,
        backward: 0,
        forwardTime: 0,
        backwardTime: 0,
        itemType: "DELAYED",
        getChat: false,
        getMessages: true,
      })
      const lookup = { names: namesFrom(session.contacts), ...viewer(this.#store) }
      return asArray(answer.messages)
        .map((raw) => toMessage(raw, chatId, lookup))
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))
    },

    /**
     * **Paged backwards through time, not by page number.** MAX's history is already anchored —
     * it takes a moment and answers with what came before it — so `--before` is exact where a page
     * number over a live conversation would repeat and skip rows.
     *
     * `after` reads the other way and **leaves the anchor out**, so the next page's hint does not
     * repeat a row. MAX puts it in — measured 2026-09-23, `forward: n` with `backward: 0` starts
     * with the message it was given — so the window starts a millisecond later, and one more than the page is
     * asked for to tell whether another follows. Asking from the moment itself spent that one on the anchor.
     * `before` keeps the anchor, as it always has.
     *
     * `hasMore` here is a claim about the copy we hold, never about the chat. MAX's answer carries
     * `messages` and nothing that says whether older ones exist, and a page can come back short in the
     * middle of a chat, as Telegram's does. So a short page back is checked with one more request for a
     * single older message; a full page is taken as more, and an empty one as the start.
     */
    list: async (
      chatId: Id,
      options: { limit?: number; before?: number; after?: number; reactions?: boolean } = {},
    ): Promise<Page<Message>> => {
      const limit = options.limit ?? 20
      const { before, after, reactions = true } = options

      if (after !== undefined) {
        const found = await this.#history(chatId, { from: after + 1, backward: 0, forward: limit + 1 }, { reactions })
        const later = found.filter((message) => Date.parse(message.timestamp) > after)
        return { items: later.slice(0, limit), hasMore: later.length > limit }
      }

      const messages = await this.#history(
        chatId,
        { from: before ?? Date.now(), backward: limit, forward: 0 },
        { reactions },
      )
      const hasMore = messages.length >= limit || (messages.length > 0 && (await this.#olderThan(chatId, messages)))
      return { items: messages, hasMore }
    },

    /**
     * **A chat's gallery**, as web.max.ru asks for it: messages that carry these kinds of attachment,
     * read back from a message — the newest one, or `before`. Oldest first, like history.
     */
    media: async (chatId: Id, kinds: MediaKind[], limit: number, before?: Id): Promise<Page<Message>> => {
      await this.#connectOnce()
      const anchor = before ?? (await this.#newestId(chatId))
      if (anchor === undefined) return { items: [], hasMore: false }
      const answer = await this.#wire.messages.media({
        chatId,
        messageId: anchor,
        attachTypes: [...new Set(kinds.map((kind) => MEDIA_TYPES[kind]))],
        forward: 0,
        backward: limit + 1,
      })
      const lookup = { names: namesFrom(this.#session().contacts), ...viewer(this.#store) }
      const raw = asArray(answer.messages)
        .map((one) => record(one) ?? {})
        .filter((one) => asId(one.id) !== before)
      const older = raw.length > limit
      const items = await this.#nameSenders(
        raw.slice(older ? raw.length - limit : 0).map((one) => toMessage(one, chatId, lookup)),
      )
      return { items, hasMore: older }
    },

    /**
     * **MAX's own text search, in one chat**, newest first as the server answers. It matches a word's
     * beginning, not another form of a Russian word (measured 2026-10-07): the caller treats the answer
     * as candidates. No reactions, no read marks.
     */
    search: async (chatId: Id, query: string, limit: number): Promise<Page<Message>> => {
      await this.#connectOnce()
      const answer = await this.#wire.messages.search({ chatId, query, count: limit })
      const lookup = { names: namesFrom(this.#session().contacts), ...viewer(this.#store) }
      const raw = asArray(answer.result).flatMap((one) => {
        const message = record(record(one)?.message)
        return message === undefined ? [] : [message]
      })
      const items = await this.#nameSenders(raw.map((one) => toMessage(one, chatId, lookup)))
      return { items, hasMore: items.length >= limit }
    },

    /**
     * **One message and a window either side of it**, oldest first, the one asked for marked
     * `anchor: true`.
     *
     * Measured 2026-09-22: from a message's own time, `backward: n` answers n messages ending with
     * it and `forward: n` the n after it. Its time comes from its id, so no stored copy is needed.
     * Correction 2026-09-23: that holds with `backward` above zero; with `backward: 0`, `forward`
     * starts with the message itself (`messages.list` with `after` depends on the difference).
     *
     * ⚠ **A message that is gone is refused, not replaced by its neighbour** — MAX answers with
     * whatever is nearest, and showing that as the message asked for would be a quiet lie.
     */
    around: async (
      chatId: Id,
      messageId: Id,
      { before = 0, after = 0, reactions = true }: { before?: number; after?: number; reactions?: boolean } = {},
    ): Promise<WindowedMessage[]> => {
      const time = timeOfMessageId(messageId)
      if (time === undefined) throw new CliError("validation_error", `"${messageId}" is not a message id`)

      const found = await this.#history(chatId, { from: time, backward: before + 1, forward: after }, { reactions })

      if (!found.some((message) => message.id === messageId)) {
        throw new CliError("not_found", `no message ${messageId} in chat ${chatId} — deleted, or in another chat`)
      }
      return found.map((message) => (message.id === messageId ? { ...message, anchor: true } : message))
    },

    /**
     * **Where each attachment of one message can be downloaded from.** A photo and an audio carry
     * their link; a file and a video carry only an id, and MAX answers the link for it (measured
     * 2026-09-23). A video is taken as its largest MP4 — the streaming renditions are playlists,
     * not a file. An attachment with no link to give is left out and named in `skipped`.
     */
    links: async (chatId: Id, messageId: Id): Promise<{ links: AttachmentLink[]; skipped: string[] }> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot download")
      const [message] = await this.messages.around(chatId, messageId, { reactions: false })
      if (!message) throw new CliError("not_found", `no message ${messageId} in chat ${chatId}`)

      const links: AttachmentLink[] = []
      const skipped: string[] = []
      for (const attachment of message.attachments) {
        const { kind, name } = attachment
        if (attachment.fileId) {
          const answer = await this.#wire.attachments.file({ chatId, messageId, fileId: attachment.fileId })
          const url = typeof answer.url === "string" ? answer.url : undefined
          if (url)
            links.push({ kind, url, ...(name ? { name } : {}), ...(answer.unsafe === true ? { unsafe: true } : {}) })
          else skipped.push(kind)
        } else if (attachment.videoId) {
          const answer = await this.#wire.attachments.video({ chatId, messageId, videoId: attachment.videoId })
          const url = largestMp4(answer)
          if (url) links.push({ kind, url })
          else skipped.push(kind)
        } else if (attachment.url && (kind === "photo" || kind === "audio")) {
          links.push({ kind, url: attachment.url })
        } else {
          skipped.push(kind)
        }
      }
      return { links, skipped }
    },

    /**
     * Turns what `--before` or `--after` was given into a moment.
     *
     * **ISO 8601 is a time; a bare integer is a message id**, and a message id carries its own time
     * (`timeOfMessageId`). Deciding between the two by length would be a trap that fires the first
     * time either changes size, so the rule is what the string looks like.
     */
    moment: (reference: string, flag = "--before"): number => {
      const wanted = reference.trim()
      const ago = delayMs(wanted)
      const time = /^\d+$/.test(wanted)
        ? timeOfMessageId(wanted)
        : ago === undefined
          ? Date.parse(wanted)
          : Date.now() - ago
      if (time === undefined || Number.isNaN(time)) {
        throw new CliError(
          "validation_error",
          `${flag} takes a message id, an ISO 8601 time or 30m, 2h, 1d ago — not "${wanted}"`,
        )
      }
      return time
    },

    /**
     * Sends one message, retrying **only with the same `cid`**.
     *
     * §17 allows a send to be retried when the protocol has a verified deduplication handle. It has
     * one, measured against MAX on 2026-09-19: sending the same `cid` twice returned the same
     * message id and left **one** copy in the chat — and it held across two separate connections
     * and logins, which is the case a retry actually faces.
     *
     * So one retry, same `cid`, and nothing beyond that. What is still unmeasured is how long the
     * server remembers a `cid`; the two probes were seconds apart. If the retry also fails the
     * answer is `outcome_unknown` — never failed, never sent — and it names the `cid`, because
     * `max messages send … --send-id <n>` can then repeat the attempt without risking a second message.
     *
     * **`at` queues it on MAX** (epoch ms), which sends it then even with this machine off. That is
     * never retried: deduplication by `cid` was measured for ordinary messages only, and a second
     * copy would surface later, where nobody is watching. The guard counts it now, when it is queued.
     */
    send: async (
      chatId: Id,
      text: string,
      options: {
        cid?: number
        notify?: boolean
        replyTo?: Id
        markdown?: boolean
        files?: string[]
        /** Send every file as a plain file, a video included — how a video went before `MAX-23`. */
        asFile?: boolean
        /** An Ogg Opus file sent as a voice message, alone in its message. */
        voice?: string
        anyFile?: boolean
        at?: number
        /** Files already read and checked by the caller — the shared services read their own. */
        uploads?: { name: string; bytes: Uint8Array; kind: "photo" | "video" | "file" | "voice" }[]
        /** Marks already taken out of `text`, in MAX's names. */
        markup?: Markup[]
      } = {},
    ): Promise<Message> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot send")
      if (options.voice !== undefined && (text !== "" || (options.files ?? []).length > 0)) {
        // MAX kept a caption beside a voice message (measured 2026-09-27), but web.max.ru never sends one; §34.
        throw new CliError("validation_error", "a voice message goes alone — no text and no --file beside it")
      }
      if (options.at !== undefined && options.notify === false) {
        // The web client always sends a scheduled message with `notify: true`; §34.
        throw new CliError(
          "validation_error",
          "a scheduled message cannot be silent — MAX's own client never sends one",
        )
      }

      // Read before the guard holds a place under the limit: a file that is refused sends nothing.
      const files: Upload[] = await Promise.all(
        (options.files ?? []).map(async (path) => ({
          path,
          bytes: await readUpload(path, { anyFile: options.anyFile === true }),
          kind: isImage(path) ? "photo" : isVideo(path) && options.asFile !== true ? "video" : "file",
        })),
      )
      for (const { name, bytes, kind } of options.uploads ?? []) {
        const held = Buffer.from(bytes)
        files.push({ path: name, bytes: held, kind, ...(kind === "voice" ? { voice: await voiceOf(name, held) } : {}) })
      }
      if (options.voice !== undefined) {
        const bytes = await readUpload(options.voice, { anyFile: options.anyFile === true })
        files.push({ path: options.voice, bytes, kind: "voice", voice: await voiceOf(options.voice, bytes) })
      }

      // Measured 2026-09-24: photos share a message, but a file with anything beside it is refused `proto.payload`.
      // A video is kept alone the same way; a mixed message was never measured.
      if (files.some((file) => file.kind !== "photo") && files.length > 1) {
        throw new CliError(
          "validation_error",
          "a file or a video goes in a message of its own — photos can share one; send them apart",
        )
      }

      const cid = options.cid ?? this.#nextCid()
      const sendId = String(cid)
      // Before connecting: a refused send never opens a socket when the chat was given as an id.
      try {
        await this.#checked({
          chatId,
          kind: "message",
          sendId,
          ...(options.at === undefined ? {} : { scheduledFor: new Date(options.at).toISOString() }),
        })
      } catch (error) {
        this.#sends?.record({ chatId, outcome: "refused", sendId, errorCode: asCliError(error).code })
        throw error
      }

      const attachments = files.map(({ bytes, kind }) => ({ kind, bytes: bytes.length }))
      const summary = {
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(options.at === undefined ? {} : { scheduledFor: new Date(options.at).toISOString() }),
      }
      try {
        const sent = await this.#deliver(chatId, text, cid, { ...options, files })
        this.#sends?.record({ chatId, outcome: "sent", messageId: sent.id, sendId, length: text.length, ...summary })
        return sent
      } catch (error) {
        const failure = asCliError(error)
        this.#sends?.record({
          chatId,
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          sendId,
          length: text.length,
          ...summary,
          errorCode: failure.code,
        })
        throw error
      }
    },

    /** Puts one emoji reaction on a message; it replaces the one you had. */
    react: (chatId: Id, messageId: Id, emoji: string): Promise<Reactions> =>
      this.#reaction(chatId, messageId, () =>
        this.#wire.messages.react({ chatId, messageId, reaction: { reactionType: "EMOJI", id: emoji } }),
      ),

    /** Takes your reaction off. Measured 2026-09-24: a second call is answered the same, not refused. */
    unreact: (chatId: Id, messageId: Id): Promise<Reactions> =>
      this.#reaction(chatId, messageId, () => this.#wire.messages.unreact({ chatId, messageId }), "reactions.remove"),

    /**
     * Changes the text of one of the owner's own messages. The person may have read it already.
     *
     * **Its attachments are sent back as history gives them**: measured 2026-09-24, an edit with
     * none removes a photo from the message. Refused before asking MAX when the message is not the
     * owner's, is a forward, or carries anything but photos — the web client offers none of those. MAX's own limit is
     * `edit-timeout` from LOGIN, 604800 s when measured; past it MAX refuses and that is the answer.
     * Not retried, like a reaction.
     */
    edit: async (
      chatId: Id,
      messageId: Id,
      text: string,
      { markdown = false, markup }: { markdown?: boolean; markup?: Markup[] } = {},
    ): Promise<Message> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot edit")
      await this.#guard({ chatId, kind: "edit" }, messageId)

      try {
        await this.#connectOnce()
        const lookup = { names: namesFrom(this.#session().contacts), ...viewer(this.#store) }
        const raw = await this.#rawMessage(chatId, messageId)
        const current = toMessage(raw, chatId, lookup)
        if (current.outgoing !== true) {
          throw new CliError("validation_error", `message ${messageId} is not yours — only your own can be edited`)
        }
        if (record(raw.link)?.type === "FORWARD") {
          throw new CliError("validation_error", `message ${messageId} is a forward — a forward cannot be edited`)
        }
        // Only a photo was measured to survive the round trip; the web client refuses files, stickers and the rest too.
        const other = current.attachments.find((attachment) => attachment.kind !== "photo")
        if (other) {
          throw new CliError(
            "validation_error",
            `message ${messageId} carries a ${other.kind} — only text and photos can be edited`,
          )
        }

        const parsed = markup ? { text, markup } : markdown ? parseMarkdown(text) : { text, markup: [] }
        const answer = await this.#wire.messages.edit({
          chatId,
          messageId,
          text: parsed.text,
          elements: parsed.markup,
          attachments: asArray(raw.attaches),
        })
        this.#sends?.record({ chatId, kind: "edit", outcome: "sent", messageId, length: text.length })
        return toMessage(record(answer.message) ?? raw, chatId, lookup)
      } catch (error) {
        const failure = asCliError(error)
        this.#sends?.record({ chatId, kind: "edit", outcome: "failed", messageId, errorCode: failure.code })
        throw error
      }
    },

    /**
     * Forwards one message into another chat: a new message there, so it goes through `#deliver`
     * — the same `cid`, the same one retry — and counts against `sendsPerHour`.
     */
    forward: async (
      fromChatId: Id,
      messageId: Id,
      toChatId: Id,
      options: { cid?: number; notify?: boolean } = {},
    ): Promise<Message> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot forward")
      const cid = options.cid ?? this.#nextCid()
      const sendId = String(cid)
      await this.#guard({ chatId: toChatId, kind: "forward", sendId })

      try {
        const sent = await this.#deliver(toChatId, "", cid, {
          ...options,
          forward: { chatId: fromChatId, messageId },
          repeat: `max messages forward ${fromChatId} ${messageId} --to ${toChatId}`,
        })
        this.#sends?.record({ chatId: toChatId, kind: "forward", outcome: "sent", messageId: sent.id, sendId })
        return sent
      } catch (error) {
        const failure = asCliError(error)
        this.#sends?.record({
          chatId: toChatId,
          kind: "forward",
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          sendId,
          errorCode: failure.code,
        })
        throw error
      }
    },

    /**
     * Deletes messages — for this account only, or with `forEveryone` for everyone in the chat. The
     * owner's word is the command's `--allow-dangerous`; here it is the guard, and each message
     * counts toward the hourly limit (`MAX-47`). Whose message it is, MAX decides: an admin may
     * delete somebody else's in a group. Not retried, like an edit.
     */
    delete: async (chatId: Id, messageIds: Id[], { forEveryone = false } = {}): Promise<Deletion> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot delete")
      if (messageIds.length === 0) throw new CliError("validation_error", "name at least one message to delete")
      if (messageIds.length > DELETE_AT_ONCE) {
        throw new CliError(
          "validation_error",
          `${messageIds.length} messages at once — at most ${DELETE_AT_ONCE} per call, so MAX sees deletions spread out`,
        )
      }
      const count = messageIds.length
      await this.#guard({ chatId, kind: "delete", count, forEveryone })

      try {
        await this.#connectOnce()
        await this.#wire.messages.delete({ chatId, messageIds, forMe: !forEveryone })
        this.#sends?.record({ chatId, kind: "delete", outcome: "sent", count, forEveryone })
        return { chatId, deleted: messageIds, forEveryone }
      } catch (error) {
        this.#sends?.record({
          chatId,
          kind: "delete",
          outcome: "failed",
          count,
          forEveryone,
          errorCode: asCliError(error).code,
        })
        throw error
      }
    },

    /**
     * Pins one message in a chat, or with `null` unpins whatever is pinned — `pinMessageId: 0` is
     * how the web client unpins. No notification unless asked (`NEED-196`). Not retried.
     *
     * **Never in a personal chat**: the web client's dialog class answers `viewerCanPin` with `false`, and
     * MAX refused both in Saved messages and in a dialog with a person (measured 2026-09-24, `FIND-107`).
     * A chat the login did not list is left to MAX. In a group, pin and unpin were measured the same day.
     */
    pin: async (chatId: Id, messageId: Id | null, { notify = false } = {}): Promise<Pin> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot pin")
      await this.#guard(
        { chatId, kind: "pin", notify, key: messageId === null ? "messages.unpin" : "messages.pin" },
        messageId ?? undefined,
      )

      try {
        await this.#connectOnce()
        const known = asArray(this.#session().chats).find((raw) => asId(raw.id) === chatId)
        if (known && toChat(known).kind === "dialog") {
          throw new CliError(
            "validation_error",
            `chat ${chatId} is a personal chat — MAX pins only in groups and channels`,
          )
        }
        await this.#wire.chats.update({ chatId, pinMessageId: messageId ?? "0", notifyPin: notify })
        this.#sends?.record({ chatId, kind: "pin", notify, outcome: "sent", ...(messageId ? { messageId } : {}) })
        return { chatId, pinned: messageId }
      } catch (error) {
        this.#sends?.record({ chatId, kind: "pin", notify, outcome: "failed", errorCode: asCliError(error).code })
        throw error
      }
    },
  }

  /**
   * **Polls: vote, take a vote back, close one's own, create one.** Every one of them is a write
   * somebody else can see, so it passes the send guard and the journal under the kind of what it is:
   * a vote is a `reaction`, closing is an `edit` of the owner's message, a new poll is a `message`.
   * A vote is never retried — nothing measured makes a blind repeat safe.
   *
   * The shapes were measured in Saved messages on 2026-09-27 (`pnpm probe:polls`, `FIND-247`). The
   * checks before sending are the web client's, so what it would refuse never reaches MAX.
   */
  readonly polls = {
    /** One poll as it stands, read from its message; changes nothing. */
    show: async (chatId: Id, messageId: Id): Promise<PollMessage> => {
      await this.#connectOnce()
      return { chatId, messageId, poll: (await this.#poll(chatId, messageId)).poll }
    },

    vote: async (chatId: Id, messageId: Id, answerIds: Id[]): Promise<PollMessage> => {
      if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot vote")
      await this.#guard({ chatId, kind: "reaction", key: "polls.vote" }, messageId)

      try {
        await this.#connectOnce()
        const { attach, poll } = await this.#poll(chatId, messageId)
        const voted = poll.answers.some((answer) => answer.mine)
        if (answerIds.length === 0 && !voted) {
          throw new CliError("validation_error", `you have not voted in the poll of message ${messageId}`)
        }
        if (answerIds.length === 0 && !poll.revote) {
          throw new CliError("validation_error", `the poll of message ${messageId} does not let a vote be taken back`)
        }
        if (answerIds.length > 0 && voted && !poll.revote) {
          throw new CliError(
            "validation_error",
            `you have voted in the poll of message ${messageId}, and it does not let a vote change`,
          )
        }
        if (answerIds.length > 1 && !poll.multiple) {
          throw new CliError(
            "validation_error",
            `the poll of message ${messageId} takes one answer, not ${answerIds.length}`,
          )
        }
        const unknown = answerIds.find((id) => !poll.answers.some((answer) => answer.id === id))
        if (unknown !== undefined) {
          throw new CliError(
            "validation_error",
            `the poll of message ${messageId} has no answer ${unknown} — its answers are ${poll.answers.map((answer) => answer.id).join(", ")}`,
          )
        }

        const answer = await this.#wire.messages.pollVote({
          chatId,
          messageId,
          pollId: poll.id,
          answersIds: answerIds.map(Number),
        })
        this.#sends?.record({ chatId, kind: "reaction", outcome: "sent", messageId })
        const state = record(answer.state)
        return { chatId, messageId, poll: (state && toPoll({ ...attach, state })) ?? poll }
      } catch (error) {
        const failure = asCliError(error)
        this.#sends?.record({
          chatId,
          kind: "reaction",
          outcome: "failed",
          messageId,
          errorCode: failure.code,
        })
        if (answerIds.length > 0 && failure.details.providerError === "poll.already.voted") {
          throw new CliError(
            failure.code,
            `${failure.message}; if this poll allows changing votes, run \`polls vote <chat> <message> --retract\` in the same profile before voting again`,
            failure.details,
          )
        }
        throw error
      }
    },

    /** Closes the owner's own poll: the web client edits the message with the `closed` bit raised. */
    close: async (chatId: Id, messageId: Id): Promise<PollMessage> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot close a poll")
      await this.#guard({ chatId, kind: "edit", key: "polls.close" }, messageId)

      try {
        await this.#connectOnce()
        const { attach, poll, outgoing } = await this.#poll(chatId, messageId)
        if (!outgoing) throw new CliError("validation_error", `the poll of message ${messageId} is not yours to close`)

        // What the web client sends back: the answers' text only, no ids and no votes.
        const closed = {
          _type: "POLL",
          pollId: attach.pollId,
          title: attach.title,
          answers: asArray(attach.answers).map((each) => ({ text: each.text })),
          settings: (typeof attach.settings === "number" ? attach.settings : 0) | POLL_CLOSED,
        }
        const answer = await this.#wire.messages.edit({ chatId, messageId, attachments: [closed] })
        this.#sends?.record({ chatId, kind: "edit", outcome: "sent", messageId })
        const after = asArray(record(answer.message)?.attaches).find((each) => each._type === "POLL")
        return { chatId, messageId, poll: (after && toPoll(after)) ?? { ...poll, closed: true } }
      } catch (error) {
        this.#sends?.record({ chatId, kind: "edit", outcome: "failed", messageId, errorCode: asCliError(error).code })
        throw error
      }
    },

    /**
     * A new message whose one attachment is the poll — so it goes through `#deliver`, with its `cid`
     * and its one retry, like any message.
     */
    create: async (
      chatId: Id,
      question: string,
      answers: string[],
      options: { multiple?: boolean; anonymous?: boolean; revote?: boolean; cid?: number; notify?: boolean } = {},
    ): Promise<Message> => {
      if (this.#offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot create a poll")
      if (question.trim() === "") throw new CliError("validation_error", "a poll needs a question")
      if (answers.length < 2 || answers.some((answer) => answer.trim() === "")) {
        throw new CliError("validation_error", "a poll needs at least two answers, none of them empty")
      }

      const cid = options.cid ?? this.#nextCid()
      const sendId = String(cid)
      try {
        await this.#checked({ chatId, kind: "message", sendId, key: "polls.create" })
      } catch (error) {
        this.#sends?.record({ chatId, kind: "message", outcome: "refused", sendId, errorCode: asCliError(error).code })
        throw error
      }

      const attach = {
        _type: "POLL",
        title: question,
        answers: answers.map((text) => ({ text })),
        settings: pollSettings(options),
      }
      try {
        const sent = await this.#deliver(chatId, "", cid, {
          ...options,
          attaches: [attach],
          repeat: `max polls create ${chatId} …`,
        })
        this.#sends?.record({
          chatId,
          kind: "message",
          outcome: "sent",
          messageId: sent.id,
          sendId,
          length: question.length,
        })
        this.#warn("web.max.ru does not show polls: anyone reading this chat in a browser sees «Обновите MAX…»")
        return sent
      } catch (error) {
        const failure = asCliError(error)
        this.#sends?.record({
          chatId,
          kind: "message",
          outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
          sendId,
          errorCode: failure.code,
        })
        throw error
      }
    },
  }

  /** The poll of one message, whole as MAX sends it and read, or a refusal that says why there is none. */
  async #poll(chatId: Id, messageId: Id): Promise<{ attach: Payload; poll: Poll; outgoing: boolean }> {
    const raw = await this.#rawMessage(chatId, messageId)
    const attach = asArray(raw.attaches).find((each) => each._type === "POLL")
    if (!attach) throw new CliError("validation_error", `message ${messageId} carries no poll`)
    const poll = toPoll(attach)
    if (!poll)
      throw new CliError(
        "validation_error",
        `the poll of message ${messageId} is a newer kind this version cannot read`,
      )
    if (poll.closed) throw new CliError("validation_error", `the poll of message ${messageId} is closed`)
    const lookup = { names: namesFrom(this.#session().contacts), ...viewer(this.#store) }
    return { attach, poll, outgoing: toMessage(raw, chatId, lookup).outgoing === true }
  }

  readonly folders = {
    list: async (): Promise<Folder[]> => (await this.#folders()).map(toFolder),

    create: (title: string, chats: string[] = []): Promise<Folder> =>
      this.#change("folder-create", async () => {
        const include = await Promise.all(chats.map((chat) => this.chats.resolve(chat)))
        const answer = await this.#wire.folders.update({
          id: crypto.randomUUID(),
          title: folderTitle(title),
          include,
          filters: [],
          options: [],
        })
        return toFolder(record(answer.folder) ?? {})
      }),

    /**
     * **The folder goes back whole**, as the web client sends it: an edit that left out the chats
     * would empty the folder. What MAX keeps for itself — `sourceId`, `updateTime` — is not sent.
     */
    update: (reference: string, change: FolderChange): Promise<Folder> =>
      this.#change("folder-update", async () => {
        const folder = pickFolder(reference, await this.#folders())
        const added = await Promise.all((change.add ?? []).map((chat) => this.chats.resolve(chat)))
        const removed = new Set(await Promise.all((change.remove ?? []).map((chat) => this.chats.resolve(chat))))
        const touchesChats = added.length > 0 || removed.size > 0
        const current = toFolder(folder).chatIds
        const include = [...new Set([...current, ...added])].filter((id) => !removed.has(id))

        const answer = await this.#wire.folders.update({
          id: String(folder.id),
          title: change.title === undefined ? String(folder.title ?? "") : folderTitle(change.title),
          ...(Array.isArray(folder.include) || touchesChats ? { include } : {}),
          filters: Array.isArray(folder.filters) ? folder.filters : [],
          options: Array.isArray(folder.options) ? folder.options : [],
          ...(Array.isArray(folder.favorites) ? { favorites: folder.favorites } : {}),
        })
        return toFolder(record(answer.folder) ?? {})
      }),

    /**
     * Every folder's id, in the new order. MAX keeps "all chats" first and refuses an order that
     * changes nothing (`folder.order.all-folder-not-first`, `folder.order.same`, measured 2026-10-08),
     * so the first is put back in front and the second is not sent.
     */
    order: (ids: string[]): Promise<void> =>
      this.#change("folder-order", async () => {
        const order = ids.includes(ALL_CHATS_FOLDER)
          ? [ALL_CHATS_FOLDER, ...ids.filter((id) => id !== ALL_CHATS_FOLDER)]
          : ids
        const current = (await this.#folders()).map((folder) => String(folder.id))
        if (order.join("\n") === current.join("\n")) return
        await this.#wire.folders.reorder({ foldersOrder: order })
      }),

    /** The folder only — its chats stay where they are. */
    delete: (reference: string): Promise<Folder> =>
      this.#change("folder-delete", async () => {
        const folder = pickFolder(reference, await this.#folders())
        await this.#wire.folders.delete({ folderIds: [String(folder.id)] })
        return toFolder(folder)
      }),
  }

  /**
   * A reaction is seen by the other person, so it goes through the send guard and the send log like a
   * message. Not retried: a reaction lost in transit costs a second command, and nothing about it is
   * measured to make a blind repeat safe.
   */
  async #reaction(chatId: Id, messageId: Id, call: () => Promise<Payload>, key = "reactions.add"): Promise<Reactions> {
    if (this.#offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot react")

    try {
      await this.#checked({ chatId, kind: "reaction", key })
    } catch (error) {
      this.#sends?.record({ chatId, kind: "reaction", outcome: "refused", errorCode: asCliError(error).code })
      throw error
    }

    try {
      await this.#connectOnce()
      const answer = await call()
      this.#sends?.record({ chatId, kind: "reaction", outcome: "sent", messageId })
      return toReactions(record(answer.reactionInfo) ?? {})
    } catch (error) {
      this.#sends?.record({ chatId, kind: "reaction", outcome: "failed", messageId, errorCode: asCliError(error).code })
      throw error
    }
  }

  async #checked(request: GuardRequest): Promise<void> {
    await this.#sends?.ask?.(request)
    this.#sends?.check(request)
  }

  /** Asks the send guard, and writes a refusal to the send journal before passing it on. */
  async #guard(request: GuardRequest & { chatId: Id }, messageId?: Id): Promise<void> {
    const { chatId, kind, notify } = request
    try {
      await this.#checked(request)
    } catch (error) {
      this.#sends?.record({
        chatId,
        ...(kind ? { kind } : {}),
        ...(notify === undefined ? {} : { notify }),
        outcome: "refused",
        ...(messageId ? { messageId } : {}),
        errorCode: asCliError(error).code,
      })
      throw error
    }
  }

  /** One message as MAX sends it, for what the domain model drops — its attachments whole, its link. */
  async #rawMessage(chatId: Id, messageId: Id): Promise<Payload> {
    const time = timeOfMessageId(messageId)
    if (time === undefined) throw new CliError("validation_error", `"${messageId}" is not a message id`)
    const answer = await this.#wire.chats.history({
      chatId,
      from: time,
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    const found = asArray(answer.messages)
      .map((raw) => record(raw) ?? {})
      .find((raw) => asId(raw.id) === messageId)
    if (!found)
      throw new CliError("not_found", `no message ${messageId} in chat ${chatId} — deleted, or in another chat`)
    return found
  }

  async #deliver(
    chatId: Id,
    text: string,
    cid: number,
    options: {
      notify?: boolean
      replyTo?: Id
      forward?: { chatId: Id; messageId: Id }
      markdown?: boolean
      markup?: Markup[]
      files?: Upload[]
      /** Attachments that need no upload — a poll. */
      attaches?: Payload[]
      /** The command that repeats this attempt, named in `outcome_unknown`. */
      repeat?: string
      at?: number
    },
  ): Promise<Message> {
    const { text: plain, markup } = options.markdown ? parseMarkdown(text) : { text, markup: options.markup ?? [] }
    await this.#connectOnce()
    const session = this.#session()
    const attaches: unknown[] = [...(options.attaches ?? [])]
    for (const file of options.files ?? []) attaches.push(await this.#upload(file))
    // A forward carries no text or markup of its own — the web client leaves both out, and so was it measured.
    const content = options.forward
      ? { link: { type: "FORWARD" as const, ...options.forward } }
      : {
          text: plain,
          elements: markup,
          ...(options.replyTo ? { link: { type: "REPLY" as const, messageId: options.replyTo } } : {}),
        }
    const delayed = options.at === undefined ? {} : { delayedAttributes: { timeToFire: options.at } }
    const request = { chatId, message: { cid, attaches, ...content, ...delayed }, notify: options.notify ?? true }

    let answer: Payload
    try {
      answer = await this.#untilAttachmentsReady(() => this.#wire.messages.send(request))
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code !== "timeout" && failure.code !== "network_error") throw failure
      if (options.at !== undefined) {
        throw new CliError(
          "outcome_unknown",
          `the message may or may not have been scheduled (${failure.message}) — ` +
            `\`max messages scheduled ${chatId}\` shows the queue; sending it again could queue a second copy`,
          { sendId: cid },
        )
      }

      // No answer came back, so MAX may already have delivered it. Repeating the identical `cid`
      // is what makes asking again safe rather than reckless.
      try {
        answer = await this.#wire.messages.send(request)
      } catch {
        throw new CliError(
          "outcome_unknown",
          `the message may or may not have been sent (${failure.message}) — ` +
            `\`${options.repeat ?? "max messages send <chat> <text>"} --send-id ${cid}\` repeats the attempt without risking a second copy`,
          { sendId: cid },
        )
      }
    }

    const sent = record(answer.message) ?? answer
    return toMessage(sent, chatId, { names: namesFrom(session.contacts), ...viewer(this.#store) })
  }

  /**
   * **For a connection that stays open** (`max serve`). A one-shot command never calls these.
   */
  readonly live = {
    /** The keep-alive the web client sends every 30 s; `interactive` is never true here. */
    ping: async (): Promise<void> => {
      await this.#connectOnce()
      await this.#wire.session.ping({ interactive: false })
    },

    /**
     * **The reads a web tab sends after every login** (`MAX-52`, recorded 2026-09-25), in its order
     * and all at once, as it sends them: folders, banners, call history, then the four asset sets.
     * Each carries the sync value its previous answer returned — 0 the first time — and the answers
     * are kept only for those. `max serve` alone sends them; a one-shot command never did.
     */
    readLikeTab: async (sync: TabSync): Promise<TabSync> => {
      await this.#connectOnce()
      const folders = this.#wire.folders.list({ folderSync: sync.folders })
      const banners = this.#wire.banners.list({ bannersSync: 0 })
      const calls = this.#wire.calls.history({ callHistorySync: sync.calls })
      const assets = ASSET_TYPES.map((type) => this.#wire.assets.update({ type, sync: sync.assets[type] ?? 0 }))
      const [folderAnswer, , callAnswer, answers] = await Promise.all([folders, banners, calls, Promise.all(assets)])
      return {
        folders: numberOr(folderAnswer.folderSync, sync.folders),
        calls: numberOr(callAnswer.callHistorySync, sync.calls),
        assets: Object.fromEntries(
          ASSET_TYPES.map((type, at) => [type, numberOr(answers[at]?.sync, sync.assets[type] ?? 0)]),
        ),
      }
    },

    /**
     * What a hidden web tab reports once, 20 s after it opened: the chat list, shown at `at`.
     * `sessionId` is when the tab's connection began, and it survives the tab's reconnects.
     */
    chatListShown: async ({ at, sessionId }: { at: number; sessionId: number }): Promise<void> => {
      const viewerId = this.#store.readState().viewerId
      if (!viewerId) return
      await this.#connectOnce()
      await this.#wire.session.log({
        events: [
          {
            type: "NAV",
            userId: viewerId,
            time: at,
            sessionId,
            event: "GO",
            params: { action_id: 1, screen_to: 150, prev_time: 0, source_id: viewerId },
          },
        ],
      })
    },

    /**
     * The login this connection holds, kept current from what MAX pushes — `max serve` hands it to
     * a command as that command's own login.
     */
    snapshot: (): Payload => this.#session(),

    /**
     * What the next login on a new connection sends to pick up where this one is (`MAX-51`):
     * `undefined` when this login lacks what that needs, and the next one is then a full login.
     */
    resumeFrom: (): ResumeFrom | undefined => {
      const login = this.#login
      const configHash = record(login?.config)?.hash
      if (!login || typeof login.time !== "number" || typeof configHash !== "string") return undefined
      const chats = asArray(login.chats).map((chat) => record(chat) ?? {})
      const chatsSync = Math.max(0, ...chats.map(eventTime))
      return { login: { lastLogin: login.time, chatsSync, configHash }, chats }
    },

    /**
     * Keeps the snapshot current from one push. **`false` means it can no longer be trusted** and
     * the server stops handing it out until it has logged in again. What web.max.ru does with each
     * push (bundle read 2026-09-24) is what is copied here:
     * - 128, a new message: the chat's last message and time move; unread goes up for somebody
     *   else's message and to zero for our own, as the app does once you have written in a chat.
     * - 130, read up to a point: when we are the reader, the chat's unread becomes `unread`;
     *   somebody else reading changes nothing here.
     * - 135, a chat changed: MAX sends the whole chat, and it replaces ours.
     * Anything else that touches the chats — a deletion — cannot be followed.
     */
    patch: (opcode: number, payload: Payload): boolean => {
      const chats = asArray(this.#session().chats)
      const chatId = asId(payload.chatId)
      const chat = chats.find((candidate) => asId(candidate.id) === chatId)
      const viewerId = this.#store.readState().viewerId

      if (opcode === NEW_MESSAGE) {
        const raw = record(payload.message)
        if (!raw || !chat) return false
        const ours = viewerId !== undefined && asId(raw.sender) === viewerId
        chat.lastMessage = raw
        chat.lastEventTime = raw.time
        chat.newMessages = ours ? 0 : (typeof chat.newMessages === "number" ? chat.newMessages : 0) + 1
        return true
      }
      if (opcode === READ_MARK) {
        if (asId(payload.userId) !== viewerId) return true
        if (!chat || typeof payload.unread !== "number") return false
        chat.newMessages = payload.unread
        return true
      }
      if (opcode === CHAT_CHANGED) {
        const changed = record(payload.chat)
        const id = changed && asId(changed.id)
        if (!changed || id === undefined) return false
        const at = chats.findIndex((candidate) => asId(candidate.id) === id)
        if (at >= 0) chats[at] = changed
        // Past this, a new login rebuilds the list rather than pushes growing it without end.
        else if (chats.length >= LIVE_CHATS) return false
        else chats.push(changed)
        this.#session().chats = chats
        return true
      }
      return !CHANGES_CHATS.has(opcode)
    },

    /** A contact MAX answered with after our own change to it replaces the login's copy. */
    contact: (changed: Payload): void => {
      const id = asId(changed.id)
      const contacts = asArray(this.#session().contacts)
      const at = contacts.findIndex((candidate) => asId(candidate.id) === id)
      if (id === undefined || at < 0) return
      contacts[at] = changed
      this.#session().contacts = contacts
    },

    /** One request from a command, on this connection. The server decides which ones may pass. */
    forward: async (opcode: number, payload: Payload): Promise<Payload> => {
      await this.#connectOnce()
      return this.#connection.invoke(opcode, payload)
    },

    /**
     * A message MAX pushed (opcode 128) as the same shape `messages list` prints, with its chat's
     * name — so whoever reads `max watch` gets one schema, and no MAX type crosses this file.
     * Anything else pushed answers `undefined`.
     */
    message: async (opcode: number, payload: Payload): Promise<MessageHit | undefined> => {
      const raw = record(payload.message)
      if (opcode !== NEW_MESSAGE || !raw || raw.status !== undefined) return undefined
      return this.#messageHit(payload)
    },

    /** An edit, a deletion or a reaction pushed by MAX, or `undefined` for anything else. */
    change: async (opcode: number, payload: Payload): Promise<MessageChange | undefined> => {
      const chatId = asId(payload.chatId)
      if (chatId === undefined) return undefined
      const raw = record(payload.message)
      if (opcode === NEW_MESSAGE && raw?.status === "EDITED") {
        const message = await this.#messageHit(payload)
        return message && { event: "edit", message }
      }
      const messageId = asId(opcode === NEW_MESSAGE ? raw?.id : payload.messageId)
      if (messageId === undefined) return undefined
      if (opcode === NEW_MESSAGE && raw?.status === "REMOVED") {
        return { event: "delete", chatId, chatTitle: await this.#chatTitle(chatId), messageId }
      }
      if (opcode === REACTIONS_CHANGED) {
        const reactions = toReactions(payload)
        return { event: "reaction", chatId, chatTitle: await this.#chatTitle(chatId), messageId, reactions }
      }
      return undefined
    },
  }

  async #messageHit(payload: Payload): Promise<MessageHit | undefined> {
    const raw = record(payload.message)
    const chatId = asId(payload.chatId)
    if (!raw || chatId === undefined) return undefined
    const session = this.#session()
    const [message] = await this.#nameSenders([
      toMessage(raw, chatId, { names: namesFrom(session.contacts), ...viewer(this.#store) }),
    ])
    return message && { ...message, chatTitle: await this.#chatTitle(chatId) }
  }

  async #chatTitle(chatId: Id): Promise<string | null> {
    return (await this.chats.list()).items.find((candidate) => candidate.id === chatId)?.title ?? null
  }

  /**
   * Opens the connection and logs in with the stored token, or with one offered for trial.
   *
   * The login response carries the profile, the chats, the contacts and recent messages, so most
   * commands need no further request — measured against MAX on 2026-09-19.
   *
   * **A candidate token is tried and not stored**, which is what lets `adoptToken` write to the
   * keyring only after MAX has accepted it. Nothing here writes a token; see `session/adopt.ts`.
   */
  async connect({ token: candidate }: { token?: string } = {}): Promise<void> {
    if (this.#offline)
      throw new CliError("validation_error", "`--offline` reads through the shared store; it cannot connect to MAX")
    const token = candidate ?? this.#store.readToken()
    if (!token) {
      const profile = this.#store.profile
      // cli-core swallows a keyring that will not open, so the state file is the only witness: a
      // profile that has logged in lost its keyring, not its session, and another login would
      // register one more device for nothing (MAX-50, measured from cron 2026-09-25).
      if (this.#store.hasLoggedIn()) {
        throw new CliError(
          "authentication_error",
          `no token found for profile "${profile}", although it has logged in on this machine — ` +
            `the keyring is probably out of reach (cron, ssh: set XDG_RUNTIME_DIR); ` +
            `\`max ${asFirstWord(profile)}doctor\` shows it. Log in again only if the token was removed`,
        )
      }
      if (this.#store.isBot()) {
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

    const state = this.#store.readState()
    refuseWhilePaused(state)

    const sync = this.#fullLogin ? undefined : await this.#loginMarker()

    try {
      await this.#connection.open()
      this.#login = await startSession(this.#invoke, {
        token,
        deviceId: state.deviceId,
        ...(sync === undefined ? {} : { sync }),
        ...(this.#resume ? { resume: this.#resume.login } : {}),
      })
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code !== "rate_limited") throw failure
      const paused = withLoginRefused(state)
      this.#store.writeState(paused)
      throw new CliError(
        "rate_limited",
        `${failure.message} — this profile will not log in again before ${paused.loginPausedUntil}; ` +
          "logging in sooner is what keeps an account locked",
      )
    }

    const viewerId = toProfile(record(this.#login.profile) ?? {}).id

    // **Before `writeState`**, so a login we are about to refuse does not count itself or move
    // `lastLoginAt`. A profile is a person, not a directory name: if this token belongs to someone
    // else, every later command in this process would send as them and nothing would say so.
    // Switching accounts has a door already — `session end` clears the id along with the token.
    if (viewerId && state.viewerId && viewerId !== state.viewerId) {
      throw new CliError(
        "authentication_error",
        `this token is for a different account than profile "${this.#store.profile}" was set up with — ` +
          `run \`max ${asFirstWord(this.#store.profile)}session end\` first if you meant to switch`,
      )
    }

    this.#store.writeState({
      ...withoutLoginPause(state),
      ...(viewerId ? { viewerId } : {}),
      logins: state.logins + 1,
      lastLoginAt: new Date().toISOString(),
    })

    this.#keepRotatedToken(token)
    // `max serve` hands this login to any process that asks its socket; none of them needs the token.
    const { token: _, ...withoutToken } = this.#login
    this.#login = withoutToken
    if (this.#resume) this.#mergeChanged(this.#resume.chats)
    else await this.#readRestOfChats()
    await this.#mergeLogin(viewerId)
  }

  /**
   * A login with `chatsSync` answers only the chats that changed since it (measured 2026-09-20), so
   * they go over the list the previous connection held: same id replaced, the rest kept, newest first.
   */
  #mergeChanged(before: Payload[]): void {
    const session = this.#session()
    const changed = asArray(session.chats)
    const ids = new Set(changed.map((chat) => asId(record(chat)?.id)))
    const kept = before.filter((chat) => !ids.has(asId(chat.id)))
    session.chats = [...changed, ...kept].sort((a, b) => eventTime(b) - eventTime(a))
  }

  /**
   * **The chats LOGIN left out, as the web tab reads them:** one `CHATS_LIST` from the last-activity
   * time of the oldest chat it sent, 2.3 s after the login answer (capture 2026-09-25). Measured the
   * same day: that answers exactly the chats after it, and one answer held 26. Only one request,
   * because the tab sends only one — `#chatsCut` says when that may not have been all.
   *
   * A refusal leaves the login's chats as they were: a shorter list beats a failed command.
   */
  async #readRestOfChats(): Promise<void> {
    this.#chatsCut = false
    this.#chatsComplete = false
    const session = this.#session()
    const chats = asArray(session.chats)
    const marker = record(chats.at(-1))?.lastEventTime
    if (chats.length < LOGIN_CHATS) {
      this.#chatsComplete = true
      return
    }
    if (typeof marker !== "number" && typeof marker !== "bigint") return

    try {
      const answer = await this.#wire.chats.list({ marker: Number(marker) })
      const known = new Set(chats.map((chat) => asId(record(chat)?.id)))
      const rest = asArray(answer.chats).filter((chat) => !known.has(asId(record(chat)?.id)))
      session.chats = [...chats, ...rest]
      this.#chatsCut = rest.length >= CHATS_PAGE_SEEN
      this.#chatsComplete = !this.#chatsCut
    } catch (error) {
      this.#chatsCut = true
      this.#warnAbout("chats_partial", `only the newest ${chats.length} chats were read: ${reasonOf(error)}`)
    }
  }

  /**
   * **MAX offers a replacement for a credential that has aged, and until 2026-09-22 we threw it
   * away** — measured, `pnpm probe:token`. Presenting a token pasted months earlier answers with a
   * different one; presenting *that* one answers with the same one back, so this writes once and
   * then stops rather than on every command.
   *
   * The old token keeps working — the last months are the proof — so this is hygiene, not repair.
   *
   * ⚠ **After the identity refusal above, never before it.** A token belonging to somebody else
   * reaches this method only if that check has already let it through; persisting it earlier would
   * overwrite the owner's working credential with a stranger's — a worse version of the defect
   * `MAX-12` exists to fix.
   *
   * **A keyring that will not take it does not fail the command.** The write can fail for reasons
   * that have nothing to do with the command being run — a locked keyring, no session bus — and
   * the old token still works, which is what makes carrying on correct. The reason goes to the
   * diagnostic stream, because failing quietly is not failing invisibly (`NEED-97`).
   *
   * Nothing here prints, returns or compares-aloud the value: the only comparison is against the
   * token we sent, and the only thing that leaves is whether a write failed.
   */
  #keepRotatedToken(sent: string): void {
    const rotated = this.#session().token
    if (typeof rotated !== "string" || rotated === "" || rotated === sent) return
    if (this.#fromEnvironment()) {
      this.#warnAbout(
        "token_not_saved",
        "MAX refreshed the session; the fresh token was not saved, because the one in use came from MAX_TOKEN",
      )
      return
    }

    try {
      this.#store.writeToken(rotated)
    } catch (error) {
      this.#warnAbout(
        "token_not_saved",
        `the refreshed session could not be saved, so the previous one is still in use: ${reasonOf(error)}`,
      )
    }
  }

  /**
   * Writes what the login just told us into the store, **before the command renders**, so a
   * listing prints the names this run brought rather than the previous run's.
   *
   * ⚠ **A delta is mostly empty and that is correct.** After the first login MAX sends only what
   * changed, so an absent person is an unchanged person — never a departed one. Nothing here
   * deletes, with the single exception of a chat's membership, which MAX restates in full whenever
   * it sends that chat at all.
   *
   * **It never fails the command.** Nobody asked for the store; a locked database or a full disk
   * must not lose an answer MAX has already given. The reason goes to the diagnostic stream,
   * because failing quietly is not the same as failing invisibly (`NEED-97`) — and the marker
   * stays where it was, so the next login asks for the same delta again rather than for changes
   * since rows that were never written.
   */
  async #mergeLogin(viewerId: string | undefined): Promise<void> {
    const marker = asMarker(this.#session().time)
    if (!this.#record) return

    const chats = asArray(this.#session().chats)
    const members = new Map<Id, Id[]>()
    for (const raw of chats) {
      const chat = toChat(raw)
      // A channel lists four of its hundred and seventy-eight thousand subscribers, so its
      // `participants` is not a membership — storing it would be storing a wrong answer.
      if (!chat.id || chat.kind === "channel") continue
      const participants = this.#participantsOf(raw, viewerId)
      if (participants !== undefined) members.set(chat.id, participants)
    }

    const delta = {
      chats: chats.map(toChat).filter((chat) => chat.id !== ""),
      people: asArray(this.#session().contacts)
        .map(toContact)
        .filter((contact) => contact.id !== ""),
      members,
    }
    // A login `max serve` made answered its own marker, not the record's: what changed before it is not in it.
    const own = this.server?.journals !== true
    await this.#keep("login", async (record) => {
      const summary = await record.applyLogin({ ...delta, ...(own && marker !== undefined ? { marker } : {}) })
      this.#merged = summary
    })
  }

  async #loginMarker(): Promise<number | undefined> {
    let marker: number | undefined
    await this.#keep("marker", async (record) => {
      marker = await record.syncMarker()
    })
    return marker
  }

  /** A failed record never loses an answer MAX already gave. */
  async #keep(what: string, write: (record: MaxRecord) => Promise<void>): Promise<void> {
    if (!this.#record) return
    try {
      await write(this.#record)
    } catch (error) {
      this.#warnAbout("cache_not_written", `the local store did not take the ${what}: ${reasonOf(error)}`)
    }
  }

  #participantsOf(chat: Payload, viewerId: string | undefined): Id[] | undefined {
    const participants = record(chat.participants)
    return participants === undefined ? undefined : Object.keys(participants).filter((id) => id !== viewerId)
  }

  /** Ends this session on MAX's side; the token stops working everywhere it was copied to. */
  async logout(): Promise<void> {
    if (this.#offline) throw new CliError("validation_error", "`--offline` cannot log out on MAX's side")
    await this.#connectOnce()
    await this.#wire.session.logout({})
  }

  async close(): Promise<void> {
    await this.#connection.close()
  }

  /**
   * Never `CHAT_MARK`: reading history must not mark anything read (§19). Without `interactive`, as
   * the web client asks — measured 2026-09-25 on a channel with 8 unread: reading moved nothing.
   */
  async #history(
    chatId: Id,
    window: { from: number; backward: number; forward: number },
    { reactions = true }: { reactions?: boolean } = {},
  ): Promise<Message[]> {
    await this.#connectOnce()
    const session = this.#session()
    const answer = await this.#wire.chats.history({
      chatId,
      ...window,
      getMessages: true,
    })

    const lookup = { names: namesFrom(session.contacts), ...viewer(this.#store) }
    const messages = await this.#nameSenders(asArray(answer.messages).map((raw) => toMessage(raw, chatId, lookup)))
    return reactions ? this.#withReactions(chatId, messages) : messages
  }

  /** Straight to the wire, as `#olderThan`: one message's id is all a gallery read needs to start from. */
  async #newestId(chatId: Id): Promise<Id | undefined> {
    const answer = await this.#wire.chats.history({
      chatId,
      from: Date.now(),
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    return asId(record(asArray(answer.messages).at(-1))?.id)
  }

  /** Straight to the wire: the reactions and names `#history` fetches are not wanted for a yes or no. */
  async #olderThan(chatId: Id, messages: Message[]): Promise<boolean> {
    const oldest = Math.min(...messages.map((message) => Date.parse(message.timestamp)))
    const answer = await this.#wire.chats.history({
      chatId,
      from: oldest - 1,
      forward: 0,
      backward: 1,
      getMessages: true,
    })
    return asArray(answer.messages).length > 0
  }

  /**
   * One request per page, which also says which reaction is this account's. History carries the counts only in
   * a channel (measured 2026-10-06); ~~history carries no reactions (measured 2026-09-23)~~ held for other chats.
   */
  async #withReactions(chatId: Id, messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) return messages
    try {
      const answer = await this.#wire.messages.reactions({ chatId, messageIds: messages.map((message) => message.id) })
      const byId = record(answer.messagesReactions) ?? {}
      return messages.map((message) => {
        const raw = record(byId[message.id])
        return { ...message, reactions: raw ? toReactions(raw) : { counts: [], mine: null, total: 0 } }
      })
    } catch (error) {
      this.#warnAbout("reactions_unread", `reactions are not shown: they could not be read (${reasonOf(error)})`)
      return messages
    }
  }

  /**
   * **A group member who is not a contact arrives as a bare id** — the login names contacts only,
   * so in a group chat everyone but the owner showed as a number (`FIND-45`). The names we hold
   * answer first; the rest cost one `CONTACT_INFO` per hundred, and are kept so the next read
   * does not ask again. Quoted senders in replies and forwards are named the same way.
   *
   * A refused lookup costs the names, not the read: the messages are what was asked for.
   */
  async #nameSenders(messages: Message[]): Promise<Message[]> {
    const quoted = messages.flatMap((message) => [message.replyTo, message.forwardedFrom]).filter(isPresent)
    const ids = [...new Set([...messages, ...quoted].filter(needsName).map((message) => message.senderId as Id))]
    if (ids.length === 0) return messages

    const names = await this.#namesOf(ids)
    const name = <T extends QuotedMessage | Message>(message: T): T =>
      needsName(message) && names.has(message.senderId as Id)
        ? { ...message, senderName: names.get(message.senderId as Id) ?? null }
        : message
    return messages.map((message) => ({
      ...name(message),
      replyTo: message.replyTo && name(message.replyTo),
      forwardedFrom: message.forwardedFrom && name(message.forwardedFrom),
    }))
  }

  /** The chat's owner and admins as the login carried them; `undefined` when it did not. */
  async #members(
    reference: string,
    { limit, offset }: { limit?: number; offset: number } = { offset: 0 },
  ): Promise<GroupMembers & { hasMore: boolean; truncated: boolean; readCount: number }> {
    if (this.#offline) throw new CliError("validation_error", "`--offline` has no member list; MAX has")
    const chatId = await this.chats.resolve(reference)
    await this.#connectOnce()
    const members = new Map<Id, GroupMember>()
    const target = limit === undefined ? MEMBERS_READ : Math.min(MEMBERS_READ, offset + limit + 1)
    let marker = 0
    let complete = false
    while (members.size < target) {
      const answer = await this.#wire.chats.members({ chatId, type: "MEMBER", marker, count: MEMBERS_PAGE })
      const before = members.size
      for (const raw of asArray(answer.members)) {
        const member = toGroupMember(raw)
        if (member.id) members.set(member.id, member)
      }
      const next = typeof answer.marker === "number" ? answer.marker : 0
      if (!next || next === marker || members.size === before) {
        complete = !next
        break
      }
      marker = next
    }
    const roles = await this.#roles(chatId)
    const role = (id: Id) => (id === roles?.owner ? "owner" : roles?.admins.has(id) ? "admin" : "member")
    const end = limit === undefined ? members.size : offset + limit
    return {
      chatId,
      members: [...members.values()]
        .slice(offset, end)
        .map((member) => (roles ? { ...member, role: role(member.id) } : member)),
      complete,
      rolesKnown: roles !== undefined,
      hasMore: end < members.size,
      truncated: !complete && (members.size < target || members.size >= MEMBERS_READ),
      readCount: members.size,
    }
  }

  async #roles(chatId: Id): Promise<{ owner?: Id; admins: Set<Id> } | undefined> {
    await this.#connectOnce()
    const raw = asArray(this.#session().chats).find((chat) => asId(chat.id) === chatId)
    if (!raw || (raw.owner === undefined && raw.admins === undefined && raw.adminParticipants === undefined)) {
      return undefined
    }
    const admins = [
      ...(Array.isArray(raw.admins) ? raw.admins.map(asId) : []),
      ...Object.keys(record(raw.adminParticipants) ?? {}),
    ].filter((id): id is Id => id !== undefined)
    const owner = asId(raw.owner)
    return { ...(owner ? { owner } : {}), admins: new Set(admins.filter((id) => id !== owner)) }
  }

  /** Names we hold first, the rest from `CONTACT_INFO`, kept for next time. A refusal costs the names only. */
  async #namesOf(ids: Id[]): Promise<Map<Id, string>> {
    const names = new Map<Id, string>()
    await this.#keep("names", async (record) => {
      for (const [id, name] of await record.names(ids)) names.set(id, name)
    })
    const fetched: Contact[] = []
    try {
      for (const batch of batched(
        ids.filter((id) => !names.has(id)),
        CONTACT_INFO_BATCH,
      )) {
        const answer = await this.#wire.contacts.info({ contactIds: batch })
        for (const raw of asArray(answer.contacts)) {
          const contact = toContact(raw)
          if (!contact.id || !contact.name) continue
          names.set(contact.id, contact.name)
          fetched.push(contact)
        }
      }
    } catch (error) {
      this.#warnAbout(
        "names_unread",
        `some people are shown by id: their names could not be looked up (${reasonOf(error)})`,
      )
    }
    await this.#keep("names", (record) => record.remember(fetched))
    return names
  }

  /** INIT with the profile's own device, which is the device MAX then issues the token to (bite 8). */
  async #beforeLogin(flow: () => Promise<string>): Promise<string> {
    try {
      await this.#connection.open()
    } catch (error) {
      throw asCliError(error)
    }
    await this.#wire.session.init({ userAgent: WEB_USER_AGENT, deviceId: this.#store.readState().deviceId })
    return await flow()
  }

  async #connectOnce(): Promise<void> {
    if (!this.#login) await this.connect()
  }

  /**
   * One request: encode against the specification, send, and compare the answer with what we said
   * it would be.
   *
   * **The comparison never decides anything** (`NEED-35`). A response that gained a field is not a
   * mismatch at all — response shapes are loose. What is left is a field we rely on that stopped
   * being what it was, which is worth one line on stderr and nothing more.
   */
  async #send<TOperation extends Operation>(operation: TOperation, request: RequestOf<TOperation>): Promise<Payload> {
    const payload = buildRequest(operation, request)
    const started = performance.now()
    const about = { operation: operation.name, opcode: operation.opcode }

    let seq = 0
    let bytes: number | undefined

    let answer: Payload
    try {
      answer = await this.#connection.invoke(operation.opcode, payload, (wire) => {
        seq = wire.seq
        if (wire.phase === "received") {
          bytes = wire.bytes
          return
        }
        this.#emit({ event: "request", ...about, seq, bytes: wire.bytes, ...idsOf(request) })
      })
    } catch (error) {
      const failure = asCliError(error)
      // The request that never came back is the one somebody is reading the log for, so it gets a
      // line of its own rather than disappearing with the exception.
      this.#emit({
        event: "response",
        ...about,
        seq,
        ...(bytes === undefined ? {} : { bytes }),
        durationMs: Math.round(performance.now() - started),
        outcome: "error",
        errorCode: failure.code,
        ...(typeof failure.details.providerError === "string" ? { providerError: failure.details.providerError } : {}),
      })
      throw failure
    }

    const counts = countsIn(answer)
    this.#emit({
      event: "response",
      ...about,
      seq,
      ...(bytes === undefined ? {} : { bytes }),
      durationMs: Math.round(performance.now() - started),
      ...(counts ? { counts } : {}),
      outcome: "ok",
    })

    const note = checkResponse(operation, answer)
    if (note) this.#warnAbout("response_shape", note, { operation: operation.name, detail: note })
    return answer
  }

  /** A token from `MAX_TOKEN` belongs to whoever set it: nothing MAX hands back replaces what is stored. */
  #fromEnvironment(): boolean {
    try {
      return this.#store.tokenSource() === "environment"
    } catch {
      return false
    }
  }

  /** The sentence to the person, and only the code to the log (`WarningEvent`). */
  #warnAbout(code: WarningCode, message: string, extra: { operation?: string; detail?: string } = {}): void {
    this.#warn(message)
    this.#emit({ event: "warning", code, ...extra })
  }

  /** A diagnostic that breaks the command it was describing is worse than no diagnostic. */
  #emit(event: DiagnosticEvent): void {
    try {
      this.#events(event)
    } catch {
      // Whoever is keeping the log has a problem; the command does not.
    }
  }

  /** A group's photo goes up as a message photo does; the web client asks `{count: 1}` for it (2026-10-08). */
  async #photoToken(photo: string | SharedUpload, { profile }: { profile: boolean }): Promise<string> {
    const path = typeof photo === "string" ? photo : photo.name
    if (!isImage(path)) throw new CliError("validation_error", `${path} is not an image MAX takes as a photo`)
    const bytes = typeof photo === "string" ? await readUpload(photo) : Buffer.from(photo.bytes)
    const { url } = await this.#wire.uploads.photo({ count: 1, type: 0, uploaderType: 0, profile })
    if (typeof url !== "string") throw new CliError("provider_error", "MAX gave no address to upload the photo to")
    return uploadPhoto(url, path, bytes)
  }

  /**
   * Uploads one file and answers what the message attaches (measured 2026-09-24). An upload is never
   * retried: a failure here happens before `MSG_SEND`, so nothing was sent.
   */
  async #upload({ path, bytes, kind, voice }: Upload): Promise<Payload> {
    const request = { count: 1, type: 0, uploaderType: 0, profile: false } as const
    if (kind === "photo") {
      const { url } = await this.#wire.uploads.photo(request)
      if (typeof url !== "string") throw new CliError("provider_error", "MAX gave no address to upload the photo to")
      return { _type: "PHOTO", photoToken: await uploadPhoto(url, path, bytes) }
    }
    if (kind === "video" || kind === "voice") {
      const slot = voice ? ({ ...request, type: 2, uploaderType: 1 } as const) : request
      const info = record(asArray((await this.#wire.uploads.video(slot)).info)[0]) ?? {}
      if (typeof info.url !== "string" || info.videoId === undefined) {
        throw new CliError("provider_error", `MAX gave no address to upload the ${kind} to`)
      }
      await uploadMedia(voice ? "voice message" : "video", info.url, path, bytes)
      return voice
        ? { _type: "AUDIO", audioId: info.videoId, duration: voice.durationMs, wave: voice.wave, token: info.token }
        : { _type: "VIDEO", videoId: info.videoId, token: info.token, videoType: 0 }
    }
    const info = record(asArray((await this.#wire.uploads.file(request)).info)[0]) ?? {}
    if (typeof info.url !== "string" || info.fileId === undefined) {
      throw new CliError("provider_error", "MAX gave no address to upload the file to")
    }
    await uploadFile(info.url, path, bytes)
    return { _type: "FILE", fileId: info.fileId }
  }

  /**
   * **A file is processed after its upload**, and a send before that is refused
   * `attachment.not.ready` (measured 2026-09-24). A refusal means nothing was sent, so asking again
   * with the same request — the same `cid` — is safe. Once a second, for up to thirty.
   */
  async #untilAttachmentsReady(send: () => Promise<Payload>): Promise<Payload> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await send()
      } catch (error) {
        if (attempt >= 30 || !asCliError(error).message.includes("attachment.not.ready")) throw error
        await this.#sleep(1000, undefined, "retry")
      }
    }
  }

  /**
   * Every change to a chat, guarded and journalled as a send is. Never retried: none of these is
   * measured to be safe to repeat, and a repeated `create` is a second group.
   */
  async #changeChat<T>(
    chatId: Id | null,
    action: ChatAction,
    act: () => Promise<{ chatId: Id; result: T; people?: number }>,
    personIds?: Id[],
  ): Promise<T> {
    if (this.#offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change a chat")

    try {
      await this.#checked({ chatId, kind: "chat", action, ...(personIds ? { personIds } : {}) })
    } catch (error) {
      this.#sends?.record({ chatId, kind: "chat", action, outcome: "refused", errorCode: asCliError(error).code })
      throw error
    }

    try {
      await this.#connectOnce()
      const done = await act()
      this.#sends?.record({
        chatId: done.chatId,
        kind: "chat",
        action,
        outcome: "sent",
        ...(done.people === undefined ? {} : { people: done.people }),
      })
      return done.result
    } catch (error) {
      const failure = asCliError(error)
      this.#sends?.record({
        chatId,
        kind: "chat",
        action,
        outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
        errorCode: failure.code,
      })
      throw error
    }
  }

  async #updateMembers(
    reference: string,
    people: string[],
    action: ChatAction,
    change: Omit<RequestOf<typeof chatsUpdateMembers>, "chatId" | "userIds">,
  ): Promise<ChatChange> {
    const chatId = await this.chats.resolve(reference)
    const userIds = await this.#personIds(people)
    return this.#changeChat(
      chatId,
      action,
      async () => {
        const answer = await this.#wire.chats.updateMembers({ chatId, userIds, ...change })
        const chat = record(answer.chat)
        return {
          chatId,
          people: userIds.length,
          result: { chatId, action, people: userIds, chat: chat ? toGroupCard(chat) : null },
        }
      },
      action === "members.add" ? userIds : undefined,
    )
  }

  takeApplied(operationId: string | undefined): boolean {
    return operationId !== undefined && this.#appliedOperations.delete(operationId)
  }

  /** An id goes as given; a name is looked up in the store, and an ambiguous one is refused. */
  people(references: string[]): Promise<Id[]> {
    return this.#personIds(references)
  }

  async #personIds(references: string[]): Promise<Id[]> {
    if (references.every(isId)) return references.map((reference) => reference.trim())

    if (!this.#record) {
      throw new CliError(
        "configuration_error",
        `there is no local store for profile "${this.#store.profile}" to look names up in — give people by id`,
      )
    }
    await this.#connectOnce()
    await this.#peopleFor(asArray(this.#session().chats))
    return Promise.all(
      references.map(async (reference) => (isId(reference) ? reference.trim() : (await this.#person(reference)).id)),
    )
  }

  /** The `max serve` this client talks through, when it does — the server then journals each write. */
  get server(): { readonly journals: boolean } | undefined {
    return "journals" in this.#connection ? (this.#connection as { readonly journals: boolean }) : undefined
  }

  /** A send id as MAX's own client makes one: the moment, in milliseconds, never repeated. */
  newSendId(): string {
    return String(this.#nextCid())
  }

  /**
   * A client id that never repeats within a process.
   *
   * `Date.now()` alone is not enough: two sends in the same millisecond get the same number, and if
   * MAX really does deduplicate by `cid` the second message vanishes with no error anywhere. Caught
   * by a test, not by a lost message. Across processes this is still millisecond-grained, which is
   * safe while one invocation sends one message.
   */
  #nextCid(): number {
    const now = Date.now()
    this.#previousCid = now > this.#previousCid ? now : this.#previousCid + 1
    return this.#previousCid
  }

  /**
   * Names for everyone in these chats, from the login response first and one request for the rest.
   *
   * One `CONTACT_INFO` for all the unknown ids rather than one per chat: a person with forty
   * dialogs should not cost forty round trips, and the login only carries a handful of contacts —
   * six of seventeen dialog partners, measured on a real account.
   */
  async #peopleFor(chats: Payload[]): Promise<Map<Id, Contact>> {
    if (this.#people) return this.#people

    const people = new Map<Id, Contact>()
    for (const raw of asArray(this.#session().contacts)) {
      const contact = toContact(raw)
      if (contact.id) people.set(contact.id, contact)
    }

    const viewerId = this.#store.readState().viewerId
    const missing = new Set<Id>()
    for (const chat of chats) {
      if (toChat(chat).kind === "channel") continue
      for (const id of this.#participantsOf(chat, viewerId) ?? []) if (!people.has(id)) missing.add(id)
    }

    const named: Contact[] = []
    for (const batch of batched([...missing], CONTACT_INFO_BATCH)) {
      const answer = await this.#wire.contacts.info({ contactIds: batch })
      for (const raw of asArray(answer.contacts)) {
        const contact = toContact(raw)
        if (!contact.id) continue
        people.set(contact.id, contact)
        named.push(contact)
      }
    }

    // One-shot clients keep these names for the next command.
    if (named.length > 0) {
      await this.#keep("names", (record) => record.remember(named))
    }

    this.#people = people
    return people
  }

  /** The other party in a one-to-one chat, if there is exactly one. */
  #partnerOf(chat: Payload): Id | undefined {
    const participants = record(chat.participants)
    if (!participants) return undefined

    const viewerId = this.#store.readState().viewerId
    const others = Object.keys(participants).filter((id) => id !== viewerId)
    return others.length === 1 ? others[0] : undefined
  }

  /**
   * A change to the account itself, not to a chat: a read-only profile refuses it, no recipient
   * list applies, it does not count towards the hourly limit, and the journal records which kind
   * of change it was. **Never retried** — at worst the command is typed again.
   */
  async #change<T>(action: AccountAction, body: (done: () => void) => Promise<T>): Promise<T> {
    if (this.#offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change the account")

    try {
      await this.#checked({ chatId: null, kind: "account", action })
    } catch (error) {
      this.#sends?.record({
        chatId: null,
        kind: "account",
        action,
        outcome: "refused",
        errorCode: asCliError(error).code,
      })
      throw error
    }

    let recorded = false
    const done = () => {
      if (recorded) return
      recorded = true
      const operationId = currentOperation()
      if (operationId !== undefined) this.#appliedOperations.add(operationId)
      this.#sends?.record({ chatId: null, kind: "account", action, outcome: "sent" })
    }

    try {
      await this.#connectOnce()
      const result = await body(done)
      done()
      return result
    } catch (error) {
      if (!recorded) {
        this.#sends?.record({
          chatId: null,
          kind: "account",
          action,
          outcome: "failed",
          errorCode: asCliError(error).code,
        })
      }
      throw error
    }
  }

  #contactAction(action: AccountAction, wire: ContactWire, reference: string): Promise<Contact> {
    return this.#change(action, async () => {
      const known = isId(reference) ? (await this.#record?.people())?.get(reference.trim()) : undefined
      const id = isId(reference) ? reference.trim() : (await this.#person(reference)).id

      const answer = await this.#wire.contacts.update({ contactId: id, ...wire })
      const contact = record(answer.contact)
      if (contact) return this.#remember(toContact(contact))
      return known ?? { id, name: null, username: null, description: null, lastMessagedAt: null }
    })
  }

  async #person(reference: string): Promise<Contact> {
    if (this.#record) return pickStoredPerson(reference, await this.#record.people())
    throw new CliError(
      "validation_error",
      "without a local store a person is named by id — `max contacts lookup` finds one",
    )
  }

  async #remember(contact: Contact): Promise<Contact> {
    if (contact.id !== "") {
      await this.#keep("contact", (record) => record.remember([contact]))
    }
    return contact
  }

  async #folders(): Promise<Payload[]> {
    if (this.#offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded, and folders are not recorded")
    await this.#connectOnce()
    const answer = await this.#wire.folders.list({ folderSync: 0 })
    const folders = asArray(answer.folders)
    const order = Array.isArray(answer.foldersOrder) ? answer.foldersOrder.map(String) : []
    const rank = (folder: Payload) => {
      const at = order.indexOf(String(folder.id))
      return at === -1 ? order.length : at
    }
    return [...folders].sort((a, b) => rank(a) - rank(b))
  }

  #session(): Payload {
    if (!this.#login) throw new CliError("configuration_error", "connect() was never called")
    return this.#login
  }
}

/** What a change to a chat answers when MAX sends back no chat of its own. */
export interface ChatChange {
  chatId: Id
  action: ChatAction
  people: Id[]
  chat: GroupCard | null
}

export type AdminRight = "read" | "members" | "admins" | "info" | "pin" | "link" | "post" | "edit" | "delete"

/**
 * PyMax `AdminPermission`; the sum is what MAX takes. `read` and `link` measured 2026-09-27 by
 * switching them in the app for a bot and reading its `permissions` back (`MAX-61`): «Read messages»
 * sets 1 and 32 together — the Bot API calls them `read_all_messages` and `write` — and «Update chat
 * link» 128. A bot without `read` sees no message of the group.
 */
export const ADMIN_RIGHTS: Record<AdminRight, number> = {
  read: 1 | 32,
  members: 2,
  admins: 4,
  info: 8,
  pin: 16,
  link: 128,
  post: 256,
  edit: 512,
  delete: 1024,
}

/** The most chats `max serve` holds from pushes before it logs in again instead. */
const LIVE_CHATS = 10_000

/** PyMax's page, the one measured. */
const MEMBERS_PAGE = 50
const MEMBERS_READ = 5000

/**
 * A private link goes as `join/<token>`, whatever came before it, as PyMax sends it and as
 * measured. A public one (`https://max.ru/<name>`) goes whole, which is PyMax's claim only.
 */
export const wireLink = (link: string): string => {
  const trimmed = link.trim()
  const at = trimmed.indexOf("join/")
  if (at >= 0 && trimmed.length > at + "join/".length) return trimmed.slice(at)
  if (/^(https:\/\/)?max\.ru\/[\w.-]+\/?$/.test(trimmed)) return trimmed
  throw new CliError("validation_error", "not a MAX link — expected https://max.ru/join/… or https://max.ru/<name>")
}

const largestMp4 = (answer: Payload): string | undefined =>
  Object.entries(answer)
    .map(([key, value]) => ({ height: /^MP4_(\d+)$/.exec(key)?.[1], value }))
    .filter(
      (entry): entry is { height: string; value: string } =>
        entry.height !== undefined && typeof entry.value === "string",
    )
    .sort((a, b) => Number(b.height) - Number(a.height))[0]?.value

/** What every listing takes. Absent means "the caller did not say", never a number chosen here. */
export interface PageRequest {
  limit?: number
  offset?: number
  /** Part of a name. Refused below three characters — see `checkedQuery`. */
  query?: string
  kind?: ChatKind
  /** Only chats MAX counts unread messages in; a chat where it did not say is not one of them. */
  unread?: boolean
}

/**
 * **The shortest search the index can answer is three characters**, and below that it returns
 * nothing rather than complaining (measured 2026-09-22). An empty list reads as "no matches",
 * so this refuses instead — the one answer that is never mistaken for a result.
 *
 * It is checked here rather than in each command, and on every path rather than only where a
 * store exists: a filter that works with a local store and not without it would make the answer depend
 * on something the person never asked about.
 */
const MIN_QUERY = 3

const checkedQuery = (query: string | undefined): string | undefined => {
  if (query === undefined) return undefined
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY) {
    throw new CliError(
      "validation_error",
      `a search needs at least ${MIN_QUERY} characters — "${trimmed}" is ${trimmed.length}`,
    )
  }
  return trimmed
}

/**
 * **One `CONTACT_INFO` for a hundred people.** The bound is unmeasured; the comparable one is
 * `chatsCount`, where 100 is accepted and 200 comes back out of range (`PROTO-3`). Somebody in
 * forty groups is the case that will find the real number, and it will find it as a refusal that
 * names itself rather than as a wrong answer.
 */
const CONTACT_INFO_BATCH = 100

/** The most chats one `CHATS_LIST` answer was seen to hold (26, 2026-09-25). A page that full may have been cut. */
const CHATS_PAGE_SEEN = 26

/**
 * When a message was sent, read from its id: **`id >> 16` is the send time in milliseconds**, the
 * low 16 bits a counter. Measured 2026-09-22 on three messages across two days, exact every time.
 * `undefined` for anything that is not a message id.
 */
export const timeOfMessageId = (id: Id): number | undefined => {
  if (!/^\d{10,20}$/.test(id)) return undefined
  const time = Number(BigInt(id) >> 16n)
  return Number.isSafeInteger(time) && time > 0 ? time : undefined
}

const HISTORY_PAGE = 100
const EVENTS_READ = 2000
/** How far back `chats events` looks without `since`. */
export const EVENTS_DAYS = 7

/** What `readLikeTab` sends back to MAX on the next login. */
export interface TabSync {
  folders: number
  calls: number
  assets: Partial<Record<(typeof ASSET_TYPES)[number], number>>
}

const ALL_CHATS_FOLDER = "all.chat.folder"

export const FIRST_TAB_SYNC: TabSync = { folders: 0, calls: 0, assets: {} }

const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback)

export interface ResumeFrom {
  login: Resume
  chats: Payload[]
}

const eventTime = (chat: unknown): number => {
  const time = record(chat)?.lastEventTime
  return typeof time === "number" ? time : 0
}

/** Reactions on a message changed; PyMax calls it `NOTIF_MSG_REACTIONS_CHANGED` (tab recording 2026-09-25). */
const REACTIONS_CHANGED = 155

/** MAX pushes this when a message arrives in any chat. PyMax calls it `NOTIF_MESSAGE`. */
const NEW_MESSAGE = 128
/** Bounded so that deleting a long history is many spread-out calls, never one sweep (`MAX-47`). */
export const DELETE_AT_ONCE = 10

/** Read up to a point — by us on another device, or by somebody else. */
const READ_MARK = 130
/** A chat changed; MAX sends it whole. */
const CHAT_CHANGED = 135
/** Messages deleted (140 in PyMax, 142 in the web client): the snapshot cannot follow them. */
const CHANGES_CHATS = new Set([140, 142])

const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined

const needsName = (message: Pick<Message, "senderId" | "senderName" | "outgoing">): boolean =>
  message.senderId !== null && message.senderName === null && message.outgoing !== true

const batched = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = []
  for (let at = 0; at < items.length; at += size) batches.push(items.slice(at, at + size))
  return batches
}

/** Filtering still works when saving the local record failed. */
const matching = (chats: Chat[], { query, kind, unread }: Pick<PageRequest, "query" | "kind" | "unread">): Chat[] => {
  const needle = query?.toLocaleLowerCase()
  return chats.filter(
    (chat) =>
      (kind === undefined || chat.kind === kind) &&
      (!unread || (chat.unreadCount ?? 0) > 0) &&
      (needle === undefined || (chat.title ?? "").toLocaleLowerCase().includes(needle)),
  )
}

/** Paging over a list already in hand — the fallback for when there is no store to page in SQL. */
const paged = <T>(items: T[], limit: number | undefined, offset: number): Page<T> => {
  const page = limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit)
  return { items: page, hasMore: offset + page.length < items.length }
}

/**
 * The marker only means anything if MAX gave us one. A login without a `time` is not a reason to
 * store `0` — that would tell the next login to send everything, which is exactly what a stored
 * marker exists to stop.
 */
const asMarker = (time: unknown): number | undefined =>
  typeof time === "number" && Number.isFinite(time) && time > 0 ? time : undefined

/** The reason, never the payload: a store's failure is a code, and the rows are people's names. */
const reasonOf = (error: unknown): string => {
  const code = (error as { code?: unknown })?.code
  return typeof code === "string" ? code : error instanceof Error ? error.name : "an unknown problem"
}

const viewer = (store: SessionStore) => {
  const viewerId = store.readState().viewerId
  return viewerId === undefined ? {} : { viewerId }
}

const record = (value: unknown): Payload | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Payload) : undefined

const asArray = (value: unknown): Payload[] =>
  Array.isArray(value) ? value.filter((item): item is Payload => record(item) !== undefined) : []

/**
 * MAX's own words become our error codes.
 *
 * A refusal naming the token is an authentication problem the user can fix by logging in again;
 * everything else from the far end is `provider_error`, and a connection that died is a network
 * one. Nothing here retries: whether an operation may be repeated is the caller's question.
 */
const asCliError = (error: unknown): CliError => {
  if (error instanceof CliError) return error

  if (error instanceof ProtocolError) {
    const key = providerErrorKey(record(error.payload)?.error)
    const refused = asRefusal(error)
    return key === undefined
      ? refused
      : new CliError(refused.code, refused.message, { ...refused.details, providerError: key })
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("did not answer")) return new CliError("timeout", message)
  return new CliError("network_error", message)
}

const asRefusal = (error: ProtocolError): CliError => {
  const text = error.message.toLowerCase()
  // First: "too many auth attempts" is a limit, not a bad token. The words are claims —
  // `error.limit.violate` from PyMax #106, `rate_limit_exceeded` from GREEN-API — never measured here.
  if (LIMIT_WORDS.some((words) => text.includes(words))) {
    return new CliError("rate_limited", error.message, { operation: String(error.opcode) })
  }
  if (text.includes("token") || text.includes("auth")) {
    return new CliError(
      "authentication_error",
      `${error.message} — the session may have expired; run \`max session start\``,
    )
  }
  return new CliError("provider_error", error.message, { operation: String(error.opcode) })
}

/** A link that was reset, or never led anywhere, is `not.found` from MAX (measured 2026-09-28). */
const deadLink =
  (link: string) =>
  (error: unknown): never => {
    const failure = asCliError(error)
    if (failure.details.providerError !== "not.found") throw failure
    throw new CliError("not_found", `${link.trim()} leads nowhere — the link was reset, or never worked`)
  }

const LIMIT_WORDS = ["limit.violate", "rate_limit", "rate limit", "too many", "слишком много"]

/** Before any request: a login inside the pause is one more attempt MAX counts (`MAX-38`). */
export const refuseWhilePaused = (state: SessionState): void => {
  const until = loginPausedUntil(state)
  if (until === undefined) return
  throw new CliError(
    "rate_limited",
    `MAX refused this profile's last login for too many attempts; it will not try again before ${until} — ` +
      "logging in sooner is what keeps an account locked",
  )
}

type ContactWire =
  | { action: "ADD" | "REMOVE" | "BLOCK" | "UNBLOCK" }
  | { action: "UPDATE"; firstName: string; lastName: string | null }

export interface ProfileChange {
  firstName?: string
  lastName?: string
  description?: string
  /** Uploaded first, so a failed upload leaves the profile as it was. */
  photo?: string | SharedUpload
}

export interface FolderChange {
  title?: string
  add?: string[]
  remove?: string[]
}

export interface PhoneBookEntry {
  phone: string
  name: string
}

const ownNames = (profile: Payload): { firstName?: string; lastName?: string } => {
  const contact = record(profile.contact) ?? profile
  const names = asArray(contact.names)
  const own = names.find((entry) => entry.type === "ONEME") ?? names[0]
  return {
    ...(typeof own?.firstName === "string" && own.firstName !== "" ? { firstName: own.firstName } : {}),
    ...(typeof own?.lastName === "string" ? { lastName: own.lastName } : {}),
  }
}

/** `+` and digits, as the lookup was measured. ⚠ The refusal never repeats what was typed. */
export const wirePhone = (typed: string): string => {
  const compact = typed.replace(/[\s()-]/g, "")
  const digits = compact.replace(/^\+/, "")
  if (!/^\d{7,15}$/.test(digits)) {
    throw new CliError("validation_error", "a phone number is 7 to 15 digits, with an optional + and the country code")
  }
  // A Russian number written the domestic way would otherwise go out as +8…, somebody else's.
  if (!compact.startsWith("+") && /^8\d{10}$/.test(digits)) {
    throw new CliError("validation_error", "write a number that starts with 8 with its country code instead: +7…")
  }
  return `+${digits}`
}

/** Measured 2026-09-25 (`MAX-57`, ASCII): 20 characters taken, 21 refused with `folder.validation.title.too-long`. */
const FOLDER_TITLE_MAX = 20

const folderTitle = (title: string): string => {
  const trimmed = title.trim()
  if (trimmed === "") throw new CliError("validation_error", "a folder needs a title")
  if ([...trimmed].length > FOLDER_TITLE_MAX) {
    throw new CliError("validation_error", `a folder title is at most ${FOLDER_TITLE_MAX} characters in MAX`)
  }
  return trimmed
}

const pickFolder = (reference: string, folders: Payload[]): Payload => {
  const wanted = reference.trim()
  const byId = folders.find((folder) => folder.id === wanted)
  if (byId) return byId
  const named = folders.filter((folder) => typeof folder.title === "string" && folder.title === wanted)
  if (named.length === 1 && named[0]) return named[0]
  if (named.length > 1) {
    throw new CliError(
      "validation_error",
      `${named.length} folders are called "${wanted}" — name one by id (\`max chats folders list\`)`,
    )
  }
  throw new CliError("not_found", `no folder "${wanted}" — \`max chats folders list\` shows them`)
}

const MEDIA_TYPES = { photo: "PHOTO", video: "VIDEO", file: "FILE", audio: "AUDIO", link: "SHARE" } as const
