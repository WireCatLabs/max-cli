import { CliError } from "@wirecat/cli-base"
import { namesFrom, toChat, toGroupCard, toGroupMember } from "../domain/map.js"
import type {
  Chat,
  ChatCard,
  ChatEvents,
  Contact,
  GroupCard,
  Id,
  JoinRequest,
  Message,
  Page,
} from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { MaxRecord } from "../record.js"
import { isId, pickChat } from "../resolve.js"
import {
  asArray,
  checkedQuery,
  deadLink,
  EVENTS_DAYS,
  EVENTS_READ,
  HISTORY_PAGE,
  matching,
  type PageRequest,
  paged,
  record,
  wireLink,
} from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  session: () => Payload
  peopleFor: (chats: Payload[]) => Promise<Map<Id, Contact>>
  partnerOf: (chat: Payload) => Id | undefined
  keep: (what: string, write: (record: MaxRecord) => Promise<void>) => Promise<void>
  readonly chatsComplete: boolean
  readonly chatsCut: boolean
  chatsList: (options?: PageRequest) => Promise<Page<Chat>>
  readonly offline: boolean
  roles: (chatId: Id) => Promise<{ owner?: Id; admins: Set<Id> } | undefined>
  readonly now: () => number
  chatsResolve: (reference: string) => Promise<Id>
  chatsSince: (chatId: Id, since: number) => Promise<{ messages: Message[]; more: boolean }>
  namesOf: (ids: Id[]) => Promise<Map<Id, string>>
  history: (
    chatId: Id,
    window: { from: number; backward: number; forward: number },
    options?: { reactions?: boolean },
  ) => Promise<Message[]>
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats">
}

export const createChatReads = (deps: Dependencies) => {
  const resource = {
    list: async (options: PageRequest = {}): Promise<Page<Chat>> => {
      const { limit, offset = 0, kind, unread } = options
      const query = checkedQuery(options.query)

      await deps.connectOnce()
      const raw = asArray(deps.session().chats)
      const people = await deps.peopleFor(raw)

      // A one-to-one chat has no title of its own — its name is the other person's, and MAX does
      // not put it in the chat object. Without this, the chats a person recognises by name are a
      // column of blanks.
      const chats = raw.map((chat) => {
        const mapped = toChat(chat)
        if (mapped.kind !== "dialog") return mapped

        const partner = deps.partnerOf(chat)
        const named = partner === undefined ? mapped : { ...mapped, providerMetadata: { partnerId: partner } }
        if (mapped.title !== null) return named
        return { ...named, title: partner === undefined ? null : (people.get(partner)?.name ?? null) }
      })

      let known = chats
      await deps.keep("chats", async (record) => {
        known = await record.rememberChats(chats, deps.chatsComplete)
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
      return deps.chatsCut && page.items.length > 0 ? { ...page, hasMore: true } : page
    },
    resolve: async (reference: string): Promise<Id> => {
      if (isId(reference)) return reference.trim()
      return pickChat(reference, (await deps.chatsList()).items).id
    },
    show: async (reference: string): Promise<ChatCard> => {
      const { items } = await deps.chatsList()
      const chat = isId(reference) ? items.find((one) => one.id === reference.trim()) : pickChat(reference, items)
      if (!chat) throw new CliError("not_found", `no chat ${reference.trim()} among this account's chats`)

      let members: ChatCard["members"] = null
      if (chat.kind !== "channel")
        await deps.keep("members", async (record) => {
          members = await record.members(chat.id)
        })
      // The login carries only the chats that changed lately; the settings of the rest are not known here.
      const raw =
        deps.offline || chat.kind === "dialog"
          ? undefined
          : asArray(deps.session().chats).find((one) => asId(one.id) === chat.id)
      const card = raw ? toGroupCard(raw) : undefined
      return {
        ...chat,
        members,
        description: card?.description ?? null,
        access: card?.access ?? null,
        settings: card?.settings ?? null,
      }
    },
    partner: async (chatId: Id): Promise<Id | undefined> => {
      await deps.connectOnce()
      const raw = asArray(deps.session().chats).find((chat) => asId(chat.id) === chatId)
      return raw ? deps.partnerOf(raw) : undefined
    },
    adminIds: async (chatId: Id): Promise<Id[] | undefined> => {
      const roles = await deps.roles(chatId)
      return roles && [...new Set([...(roles.owner ? [roles.owner] : []), ...roles.admins])]
    },
    events: async (
      reference: string,
      { since = deps.now() - EVENTS_DAYS * 86_400_000 }: { since?: number } = {},
    ): Promise<ChatEvents> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` has no history to read events from")
      const chatId = await deps.chatsResolve(reference)
      const { messages: read, more } = await deps.chatsSince(chatId, since)

      const found = read.flatMap((message) =>
        message.attachments
          .filter((attachment) => attachment.kind === "control" && attachment.event !== undefined)
          .map((attachment) => ({ message, attachment })),
      )
      const contacts = namesFrom(deps.session().contacts)
      const ids = [
        ...new Set([
          ...found.flatMap(({ attachment }) => attachment.userIds ?? []),
          ...found.flatMap(({ message }) =>
            message.senderName === null && message.senderId ? [message.senderId] : [],
          ),
        ]),
      ]
      const names = await deps.namesOf(ids.filter((id) => !contacts.has(id)))
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
    since: async (chatId: Id, since: number): Promise<{ messages: Message[]; more: boolean }> => {
      const read: Message[] = []
      let from = since
      while (true) {
        const page = (
          await deps.history(chatId, { from, backward: 0, forward: HISTORY_PAGE + 1 }, { reactions: false })
        ).filter((message) => Date.parse(message.timestamp) > from)
        read.push(...page)
        const last = page.at(-1)
        if (page.length < HISTORY_PAGE || !last) return { messages: read, more: false }
        if (read.length >= EVENTS_READ) return { messages: read, more: true }
        from = Date.parse(last.timestamp)
      }
    },
    inspect: async (link: string): Promise<GroupCard> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot read a link")
      const wire = wireLink(link)
      await deps.connectOnce()
      const answer = await deps.wire.chats.linkInfo({ link: wire }).catch(deadLink(link))
      return toGroupCard(record(answer.chat) ?? {})
    },
    joinRequests: async (
      chatId: Id,
      { limit, search, link }: { limit: number; search?: string; link?: string },
    ): Promise<Page<JoinRequest>> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` has no join requests; MAX has")
      if (link !== undefined) throw new CliError("validation_error", "MAX does not say which link a request came by")
      await deps.connectOnce()
      const answer = await deps.wire.chats.members({
        chatId,
        type: "JOIN_REQUEST",
        count: limit,
        ...(search ? { query: search } : {}),
      })
      const items = asArray(answer.members).map((raw) => {
        const { id, name, username } = toGroupMember(raw)
        return { person: { id, name, username }, requestedAt: null }
      })
      return { items, hasMore: typeof answer.marker === "number" && answer.marker > 0 }
    },
  }
  return {
    list: resource.list,
    resolve: resource.resolve,
    show: resource.show,
    partner: resource.partner,
    adminIds: resource.adminIds,
    events: resource.events,
    since: resource.since,
    inspect: resource.inspect,
    joinRequests: resource.joinRequests,
  }
}
