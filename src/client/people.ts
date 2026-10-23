import { CliError } from "@wirecat/cli-base"
import type { Contact, Id, Message, QuotedMessage } from "@wirecat/cli-core"
import { pickPerson as pickStoredPerson } from "@wirecat/cli-core"
import { toChat, toContact } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Payload } from "../protocol/frame.js"
import type { MaxRecord } from "../record.js"
import { isId } from "../resolve.js"
import type { SessionStore } from "../session/store.js"
import type { WarningCode } from "../wire-events.js"
import { asArray, batched, CONTACT_INFO_BATCH, isPresent, needsName, reasonOf, record } from "./values.js"

interface Dependencies {
  keep: (what: string, write: (record: MaxRecord) => Promise<void>) => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "contacts">
  warnAbout: (code: WarningCode, message: string, extra?: { operation?: string; detail?: string }) => void
  readonly record: MaxRecord | undefined
  readonly store: SessionStore
  connectOnce: () => Promise<void>
  session: () => Payload
  participantsOf: (chat: Payload, viewerId: string | undefined) => Id[] | undefined
}

export const createPeople = (deps: Dependencies) => {
  let cachedPeople: Map<Id, Contact> | undefined

  async function nameSenders(messages: Message[]): Promise<Message[]> {
    const quoted = messages.flatMap((message) => [message.replyTo, message.forwardedFrom]).filter(isPresent)
    const ids = [...new Set([...messages, ...quoted].filter(needsName).map((message) => message.senderId as Id))]
    if (ids.length === 0) return messages

    const names = await namesOf(ids)
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

  async function namesOf(ids: Id[]): Promise<Map<Id, string>> {
    const names = new Map<Id, string>()
    await deps.keep("names", async (record) => {
      for (const [id, name] of await record.names(ids)) names.set(id, name)
    })
    const fetched: Contact[] = []
    try {
      for (const batch of batched(
        ids.filter((id) => !names.has(id)),
        CONTACT_INFO_BATCH,
      )) {
        const answer = await deps.wire.contacts.info({ contactIds: batch })
        for (const raw of asArray(answer.contacts)) {
          const contact = toContact(raw)
          if (!contact.id || !contact.name) continue
          names.set(contact.id, contact.name)
          fetched.push(contact)
        }
      }
    } catch (error) {
      deps.warnAbout(
        "names_unread",
        `some people are shown by id: their names could not be looked up (${reasonOf(error)})`,
      )
    }
    await deps.keep("names", (record) => record.remember(fetched))
    return names
  }

  async function personIds(references: string[]): Promise<Id[]> {
    if (references.every(isId)) return references.map((reference) => reference.trim())

    if (!deps.record) {
      throw new CliError(
        "configuration_error",
        `there is no local store for profile "${deps.store.profile}" to look names up in — give people by id`,
      )
    }
    await deps.connectOnce()
    await peopleFor(asArray(deps.session().chats))
    return Promise.all(
      references.map(async (reference) => (isId(reference) ? reference.trim() : (await lookupPerson(reference)).id)),
    )
  }

  async function peopleFor(chats: Payload[]): Promise<Map<Id, Contact>> {
    if (cachedPeople) return cachedPeople

    const people = new Map<Id, Contact>()
    for (const raw of asArray(deps.session().contacts)) {
      const contact = toContact(raw)
      if (contact.id) people.set(contact.id, contact)
    }

    const viewerId = deps.store.viewerId()
    const missing = new Set<Id>()
    for (const chat of chats) {
      if (toChat(chat).kind === "channel") continue
      for (const id of deps.participantsOf(chat, viewerId) ?? []) if (!people.has(id)) missing.add(id)
    }

    const named: Contact[] = []
    for (const batch of batched([...missing], CONTACT_INFO_BATCH)) {
      const answer = await deps.wire.contacts.info({ contactIds: batch })
      for (const raw of asArray(answer.contacts)) {
        const contact = toContact(raw)
        if (!contact.id) continue
        people.set(contact.id, contact)
        named.push(contact)
      }
    }

    // One-shot clients keep these names for the next command.
    if (named.length > 0) {
      await deps.keep("names", (record) => record.remember(named))
    }

    cachedPeople = people
    return people
  }

  function partnerOf(chat: Payload): Id | undefined {
    const participants = record(chat.participants)
    if (!participants) return undefined

    const viewerId = deps.store.viewerId()
    const others = Object.keys(participants).filter((id) => id !== viewerId)
    return others.length === 1 ? others[0] : undefined
  }

  async function lookupPerson(reference: string): Promise<Contact> {
    if (deps.record) return pickStoredPerson(reference, await deps.record.people())
    throw new CliError(
      "validation_error",
      "without a local store a person is named by id — `max contacts lookup` finds one",
    )
  }

  async function remember(contact: Contact): Promise<Contact> {
    if (contact.id !== "") {
      await deps.keep("contact", (record) => record.remember([contact]))
    }
    return contact
  }

  function botOf(chatId: Id): Id {
    const viewerId = deps.store.viewerId()
    if (chatId.startsWith("-") || viewerId === undefined)
      throw new CliError("validation_error", `chat ${chatId} is not a one-to-one chat with a bot`)
    return String(BigInt(viewerId) ^ BigInt(chatId))
  }
  return {
    nameSenders: nameSenders,
    namesOf: namesOf,
    personIds: personIds,
    peopleFor: peopleFor,
    partnerOf: partnerOf,
    person: lookupPerson,
    remember: remember,
    botOf: botOf,
  }
}
