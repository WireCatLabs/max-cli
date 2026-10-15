import { CliError } from "@wirecat/cli-base"
import { toContact, toProfileFacts, toSeen } from "../domain/map.js"
import type { Contact, ContactImport, Id, PersonCard, ProfileFacts } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { MaxRecord, SyncSummary } from "../record.js"
import type { SessionStore } from "../session/store.js"
import { asArray, type ContactWire, type PhoneBookEntry, record, wirePhone } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  connectOnce: () => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "contacts">
  remember: (contact: Contact) => Promise<Contact>
  contactAction: (wire: ContactWire, reference: string) => Promise<Contact>
  change: <T>(body: (done: () => void) => Promise<T>) => Promise<T>
  readonly record: MaxRecord | undefined
  peopleFor: (chats: Payload[]) => Promise<Map<Id, Contact>>
  session: () => Payload
  person: (reference: string) => Promise<Contact>
  contactsShow: (reference: string) => Promise<PersonCard>
  readonly store: SessionStore
  keep: (what: string, write: (record: MaxRecord) => Promise<void>) => Promise<void>
  readonly merged: SyncSummary | undefined
}

export const createContacts = (deps: Dependencies) => {
  const resource = {
    lookup: async (phone: string): Promise<Contact> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot look a number up")
      const number = wirePhone(phone)
      await deps.connectOnce()
      const contact = record((await deps.wire.contacts.byPhone({ phone: number })).contact)
      if (!contact) throw new CliError("not_found", "MAX has nobody under that number")
      return deps.remember(toContact(contact))
    },
    add: (reference: string): Promise<Contact> => deps.contactAction({ action: "ADD" }, reference),
    remove: (reference: string): Promise<Contact> => deps.contactAction({ action: "REMOVE" }, reference),
    block: (reference: string): Promise<Contact> => deps.contactAction({ action: "BLOCK" }, reference),
    unblock: (reference: string): Promise<Contact> => deps.contactAction({ action: "UNBLOCK" }, reference),
    rename: (reference: string, firstName: string, lastName?: string): Promise<Contact> =>
      deps.contactAction({ action: "UPDATE", firstName, lastName: lastName ?? null }, reference),
    import: (entries: PhoneBookEntry[]): Promise<ContactImport> =>
      deps.change(async () => {
        if (entries.length === 0) throw new CliError("validation_error", "no numbers to import")
        const contactList: Record<string, { firstName: string }> = {}
        for (const entry of entries) contactList[wirePhone(entry.phone)] = { firstName: entry.name }

        const answer = await deps.wire.contacts.import({ contactList })
        return {
          sent: Object.keys(contactList).length,
          recognised: Object.keys(record(answer.phones) ?? {}),
          contacts: await Promise.all(
            asArray(answer.contacts)
              .map(toContact)
              .map((contact) => deps.remember(contact)),
          ),
        }
      }),
    show: async (reference: string): Promise<PersonCard> => {
      const record = deps.record
      if (!record) throw new CliError("configuration_error", "no local store to look people up in")
      await deps.connectOnce()
      await deps.peopleFor(asArray(deps.session().chats))
      const person = await deps.person(reference)
      const chats = (await record.chatsWith(person.id)).map(({ id, title, kind, lastMessageAt }) => ({
        id,
        title,
        kind,
        lastMessageAt,
      }))
      return { ...person, chats }
    },
    profile: async (reference: string): Promise<ProfileFacts> => {
      const card = await deps.contactsShow(reference)
      const answer = await deps.wire.contacts.info({ contactIds: [card.id] })
      const raw = asArray(answer.contacts).find((one) => asId(one.id) === card.id)
      if (!raw) throw new CliError("not_found", `MAX did not describe person ${card.id}`)
      const presence = record((await deps.wire.contacts.presence({ contactIds: [card.id] })).presence)
      const seen = toSeen(record(presence?.[card.id]))
      return { ...toProfileFacts(raw, card.chats), ...(seen ? { seen } : {}) }
    },
    sync: async (): Promise<SyncSummary & { full: true }> => {
      if (deps.offline) {
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot sync")
      }

      const record = deps.record
      if (!record) {
        throw new CliError(
          "configuration_error",
          `there is no local store for profile "${deps.store.profile}" to sync into — the note above says why`,
        )
      }

      // Before connecting, or the login would carry the marker this is meant to discard.
      await deps.keep("marker", (record) => record.forgetMarker())
      await deps.connectOnce()

      // The login names a fraction of the people in its own chats, so a full take that stopped
      // here would store ids without names for most of them.
      await deps.peopleFor(asArray(deps.session().chats))

      const known = (await record.people()).all().length
      return { ...(deps.merged ?? { known: 0, added: 0, changed: 0 }), known, full: true }
    },
  }
  return {
    lookup: resource.lookup,
    add: resource.add,
    remove: resource.remove,
    block: resource.block,
    unblock: resource.unblock,
    rename: resource.rename,
    import: resource.import,
    show: resource.show,
    profile: resource.profile,
    sync: resource.sync,
  }
}
