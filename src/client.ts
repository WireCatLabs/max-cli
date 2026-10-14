import { realSleep } from "@wirecat/cli-base"
import { createAccount } from "./client/account.js"
import { createChatMembers } from "./client/chat-members.js"
import { createChatReads } from "./client/chat-reads.js"
import { createChatWrites } from "./client/chat-writes.js"
import { createContacts } from "./client/contacts.js"
import { createDelivery } from "./client/delivery.js"
import { createFolders } from "./client/folders.js"
import { createHistory } from "./client/history.js"
import { createLive } from "./client/live.js"
import { createLogin } from "./client/login.js"
import { createMessageReads } from "./client/message-reads.js"
import { createMessageWrites } from "./client/message-writes.js"
import { createPeople } from "./client/people.js"
import { createPolls } from "./client/polls.js"
import { withReadPolicy } from "./client/read-policy.js"
import { createRequest } from "./client/request.js"
import { createSession } from "./client/session.js"
import { createStickers } from "./client/stickers.js"
import { createUploadTransport } from "./client/upload-transport.js"
import { createWrites } from "./client/writes.js"
import type { Id } from "./domain/models.js"
import { type Invoke, wireClient } from "./generated/client.generated.js"
import { Connection, type Wire } from "./protocol/connection.js"

export type { MaxClientOptions } from "./client/types.js"

import type { MaxClientOptions } from "./client/types.js"

export class MaxClient {
  readonly #session: ReturnType<typeof createSession>
  readonly #writes: ReturnType<typeof createWrites>
  readonly #people: ReturnType<typeof createPeople>
  readonly #connection: Wire
  readonly account: ReturnType<typeof createAccount>
  readonly login: ReturnType<typeof createLogin>
  readonly chats: ReturnType<typeof createChatReads> & ReturnType<typeof createChatWrites>
  readonly contacts: ReturnType<typeof createContacts>
  readonly messages: ReturnType<typeof createMessageReads> & ReturnType<typeof createMessageWrites>
  readonly polls: ReturnType<typeof createPolls>
  readonly stickers: ReturnType<typeof createStickers>
  readonly folders: ReturnType<typeof createFolders>
  readonly live: ReturnType<typeof createLive>
  constructor(options: MaxClientOptions) {
    const connection =
      options.connection ?? new Connection(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    const invoke: Invoke = (operation, input) => request.send(operation, input)
    const wire = wireClient(invoke)
    const request = createRequest({
      monotonicNow: options.monotonicNow ?? (() => performance.now()),
      connection,
      warn: options.warn ?? ((message) => process.stderr.write(`${message}\n`)),
      events: options.events ?? (() => {}),
    })
    const session = createSession({
      offline: options.offline ?? false,
      store: options.store,
      fullLogin: options.fullLogin ?? false,
      connection,
      invoke,
      resume: options.resume,
      wire,
      warnAbout: request.warnAbout,
      record: options.record,
      get server() {
        return "journals" in connection ? (connection as { readonly journals: boolean }) : undefined
      },
      now: options.now ?? Date.now,
    })
    const people = createPeople({
      keep: session.keep,
      wire,
      warnAbout: request.warnAbout,
      record: options.record,
      store: options.store,
      connectOnce: session.connectOnce,
      session: session.session,
      participantsOf: session.participantsOf,
    })
    const history = createHistory({
      connectOnce: session.connectOnce,
      session: session.session,
      wire,
      store: options.store,
      nameSenders: people.nameSenders,
      now: options.now ?? Date.now,
      warnAbout: request.warnAbout,
      chatsList: (...args) => this.chats.list(...args),
    })
    const uploadTransport = createUploadTransport({ wire })
    const delivery = createDelivery({
      wire,
      store: options.store,
      sleep: options.sleep ?? realSleep,
      connectOnce: session.connectOnce,
      session: session.session,
      upload: uploadTransport.upload,
    })
    const writes = createWrites({
      offline: options.offline ?? false,
      sends: options.sends === "caller" ? undefined : options.sends,
      connectOnce: session.connectOnce,
      wire,
      chatsResolve: (...args) => this.chats.resolve(...args),
      personIds: people.personIds,
      record: options.record,
      person: people.person,
      remember: people.remember,
      now: options.now ?? Date.now,
    })
    const chat_members = createChatMembers({
      offline: options.offline ?? false,
      chatsResolve: (...args) => this.chats.resolve(...args),
      connectOnce: session.connectOnce,
      wire,
      session: session.session,
    })
    const account = createAccount({
      connectOnce: session.connectOnce,
      session: session.session,
      change: writes.change,
      keepSettings: session.keepSettings,
      wire,
      photoToken: uploadTransport.photoToken,
      offline: options.offline ?? false,
      fromEnvironment: session.fromEnvironment,
      warnAbout: request.warnAbout,
      store: options.store,
    })
    const login = createLogin({
      beforeLogin: session.beforeLogin,
      wire,
    })
    const chat_reads = createChatReads({
      connectOnce: session.connectOnce,
      session: session.session,
      peopleFor: people.peopleFor,
      partnerOf: people.partnerOf,
      keep: session.keep,
      get chatsComplete() {
        return session.chatsComplete
      },
      get chatsCut() {
        return session.chatsCut
      },
      chatsList: (...args) => this.chats.list(...args),
      offline: options.offline ?? false,
      roles: chat_members.roles,
      now: options.now ?? Date.now,
      chatsResolve: (...args) => this.chats.resolve(...args),
      chatsSince: (...args) => this.chats.since(...args),
      namesOf: people.namesOf,
      history: history.history,
      wire,
    })
    const chat_writes = createChatWrites({
      changeChat: writes.changeChat,
      wire,
      offline: options.offline ?? false,
      guard: writes.guard,
      connectOnce: session.connectOnce,
      history: history.history,
      now: options.now ?? Date.now,
      sends: options.sends === "caller" ? undefined : options.sends,
      chatsResolve: (...args) => this.chats.resolve(...args),
      lastEventOf: session.lastEventOf,
      store: options.store,
      botOf: people.botOf,
      botWrite: writes.botWrite,
      personIds: people.personIds,
      nextCid: writes.nextCid,
      members: chat_members.members,
      updateMembers: writes.updateMembers,
      photoToken: uploadTransport.photoToken,
      session: session.session,
      chatsShow: (...args) => this.chats.show(...args),
    })
    const contacts = createContacts({
      offline: options.offline ?? false,
      connectOnce: session.connectOnce,
      wire,
      remember: people.remember,
      contactAction: writes.contactAction,
      change: writes.change,
      record: options.record,
      peopleFor: people.peopleFor,
      session: session.session,
      person: people.person,
      contactsShow: (...args) => this.contacts.show(...args),
      store: options.store,
      keep: session.keep,
      get merged() {
        return session.merged
      },
    })
    const message_reads = createMessageReads({
      offline: options.offline ?? false,
      connectOnce: session.connectOnce,
      rawMessage: history.rawMessage,
      session: session.session,
      wire,
      store: options.store,
      history: history.history,
      now: options.now ?? Date.now,
      olderThan: history.olderThan,
      newestId: history.newestId,
      nameSenders: people.nameSenders,
      messagesAround: (...args) => this.messages.around(...args),
    })
    const message_writes = createMessageWrites({
      offline: options.offline ?? false,
      guard: writes.guard,
      connectOnce: session.connectOnce,
      rawMessage: history.rawMessage,
      botWrite: writes.botWrite,
      wire,
      now: options.now ?? Date.now,
      sends: options.sends === "caller" ? undefined : options.sends,
      nextCid: writes.nextCid,
      checked: writes.checked,
      deliver: delivery.deliver,
      reaction: writes.reaction,
      session: session.session,
      store: options.store,
    })
    const polls = createPolls({
      connectOnce: session.connectOnce,
      poll: history.poll,
      offline: options.offline ?? false,
      guard: writes.guard,
      wire,
      sends: options.sends === "caller" ? undefined : options.sends,
      nextCid: writes.nextCid,
      checked: writes.checked,
      deliver: delivery.deliver,
      warn: options.warn ?? ((message) => process.stderr.write(`${message}\n`)),
    })
    const stickers = createStickers({
      connectOnce: session.connectOnce,
      wire,
    })
    const folders = createFolders({
      folders: chat_members.folders,
      change: writes.change,
      chatsResolve: (...args) => this.chats.resolve(...args),
      wire,
    })
    const live = createLive({
      connectOnce: session.connectOnce,
      wire,
      store: options.store,
      session: session.session,
      get login() {
        return session.login
      },
      set login(value) {
        session.login = value
      },
      keepSettings: session.keepSettings,
      connection,
      messageHit: history.messageHit,
      chatTitle: history.chatTitle,
    })
    this.account = withReadPolicy("account", account, options.reads)
    this.login = withReadPolicy("login", login, options.reads)
    this.chats = withReadPolicy("chats", { ...chat_reads, ...chat_writes }, options.reads)
    this.contacts = withReadPolicy("contacts", contacts, options.reads)
    this.messages = withReadPolicy("messages", { ...message_reads, ...message_writes }, options.reads)
    this.polls = withReadPolicy("polls", polls, options.reads)
    this.stickers = withReadPolicy("stickers", stickers, options.reads)
    this.folders = withReadPolicy("chats.folders", folders, options.reads)
    this.live = withReadPolicy("live", live, options.reads)
    this.#session = session
    this.#writes = writes
    this.#people = people
    this.#connection = connection
  }
  connect(options: { token?: string } = {}): Promise<void> {
    return this.#session.connect(options)
  }
  logout(): Promise<void> {
    return this.#session.logout()
  }
  close(): Promise<void> {
    return this.#session.close()
  }
  people(references: string[]): Promise<Id[]> {
    return this.#people.personIds(references)
  }
  newSendId(): string {
    return String(this.#writes.nextCid())
  }
  takeApplied(operationId: string | undefined): boolean {
    return this.#writes.takeApplied(operationId)
  }
  get server(): { readonly journals: boolean } | undefined {
    return "journals" in this.#connection ? (this.#connection as { readonly journals: boolean }) : undefined
  }
}

export type {
  AdminRight,
  ChatChange,
  FolderChange,
  PageRequest,
  PhoneBookEntry,
  ProfileChange,
  ResumeFrom,
  TabSync,
} from "./client/values.js"
export {
  ADMIN_RIGHTS,
  DELETE_AT_ONCE,
  EVENTS_DAYS,
  FIRST_TAB_SYNC,
  isJoinRequest,
  refuseWhilePaused,
  timeOfMessageId,
  wireLink,
  wirePhone,
} from "./client/values.js"
