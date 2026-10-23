import { CliError } from "@wirecat/cli-base"
import type { Contact, Id, Reactions } from "@wirecat/cli-core"
import { type ChatAction, currentOperation } from "@wirecat/cli-core/sends"
import { toContact, toGroupCard, toReactions } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Payload } from "../protocol/frame.js"
import type { MaxRecord } from "../record.js"
import { isId } from "../resolve.js"
import type { RequestOf } from "../spec/index.js"
import type { chatsUpdateMembers } from "../spec/operations/chats.js"
import { asCliError, type ChatChange, type ContactWire, record } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  connectOnce: () => Promise<void>
  chatsResolve: (reference: string) => Promise<Id>
  personIds: (references: string[]) => Promise<Id[]>
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "contacts">
  readonly record: MaxRecord | undefined
  person: (reference: string) => Promise<Contact>
  remember: (contact: Contact) => Promise<Contact>
  readonly now: () => number
}
export const createWrites = (deps: Dependencies) => {
  let previousCid: number = 0

  const appliedOperations: Set<string> = new Set()

  async function reaction(call: () => Promise<Payload>): Promise<Reactions> {
    if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot react")
    await deps.connectOnce()
    const answer = await call()
    return toReactions(record(answer.reactionInfo) ?? {})
  }

  async function botWrite(
    action: () => Promise<unknown>,
    uncertain: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await action()
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code !== "timeout" && failure.code !== "network_error") throw error
      throw new CliError(
        "outcome_unknown",
        `${uncertain} (${failure.message}) — check the bot's reply before repeating this action`,
        { ...details, retryable: false },
      )
    }
  }

  async function changeChat<T>(act: () => Promise<T>): Promise<T> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change a chat")
    await deps.connectOnce()
    return act()
  }

  async function updateMembers(
    reference: string,
    people: string[],
    action: ChatAction,
    change: Omit<RequestOf<typeof chatsUpdateMembers>, "chatId" | "userIds">,
  ): Promise<ChatChange> {
    const chatId = await deps.chatsResolve(reference)
    const userIds = await deps.personIds(people)
    return changeChat(async () => {
      const answer = await deps.wire.chats.updateMembers({ chatId, userIds, ...change })
      const chat = record(answer.chat)
      return { chatId, action, people: userIds, chat: chat ? toGroupCard(chat) : null }
    })
  }

  async function change<T>(body: (done: () => void) => Promise<T>): Promise<T> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change the account")

    let applied = false
    const done = () => {
      if (applied) return
      applied = true
      const operationId = currentOperation()
      if (operationId !== undefined) appliedOperations.add(operationId)
    }

    await deps.connectOnce()
    const result = await body(done)
    done()
    return result
  }

  function contactAction(wire: ContactWire, reference: string): Promise<Contact> {
    return change(async () => {
      const known = isId(reference) ? (await deps.record?.people())?.get(reference.trim()) : undefined
      const id = isId(reference) ? reference.trim() : (await deps.person(reference)).id

      const answer = await deps.wire.contacts.update({ contactId: id, ...wire })
      const contact = record(answer.contact)
      if (contact) return deps.remember(toContact(contact))
      return known ?? { id, name: null, username: null, description: null, lastMessagedAt: null }
    })
  }

  function nextCid(): number {
    const now = deps.now()
    previousCid = now > previousCid ? now : previousCid + 1
    return previousCid
  }

  function takeApplied(operationId: string | undefined): boolean {
    return operationId !== undefined && appliedOperations.delete(operationId)
  }
  return {
    reaction: reaction,
    botWrite: botWrite,
    changeChat: changeChat,
    updateMembers: updateMembers,
    change: change,
    contactAction: contactAction,
    nextCid: nextCid,
    takeApplied: takeApplied,
  }
}
