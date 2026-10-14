import { CliError } from "@wirecat/cli-base"
import {
  type AccountAction,
  type ChatAction,
  currentOperation,
  type GuardRequest,
  type SendGuard,
} from "@wirecat/cli-core/sends"
import { toContact, toGroupCard, toReactions } from "../domain/map.js"
import type { Contact, Id, Reactions } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Payload } from "../protocol/frame.js"
import type { MaxRecord } from "../record.js"
import { isId } from "../resolve.js"
import type { RequestOf } from "../spec/index.js"
import type { chatsUpdateMembers } from "../spec/operations/chats.js"
import { asCliError, type ChatChange, type ContactWire, record } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  readonly sends: SendGuard | undefined
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

  async function reaction(
    chatId: Id,
    messageId: Id,
    call: () => Promise<Payload>,
    key = "reactions.add",
  ): Promise<Reactions> {
    if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot react")

    try {
      await checked({ chatId, kind: "reaction", key })
    } catch (error) {
      deps.sends?.record({ chatId, kind: "reaction", outcome: "refused", errorCode: asCliError(error).code })
      throw error
    }

    try {
      await deps.connectOnce()
      const answer = await call()
      deps.sends?.record({ chatId, kind: "reaction", outcome: "sent", messageId })
      return toReactions(record(answer.reactionInfo) ?? {})
    } catch (error) {
      deps.sends?.record({ chatId, kind: "reaction", outcome: "failed", messageId, errorCode: asCliError(error).code })
      throw error
    }
  }

  async function checked(request: GuardRequest): Promise<void> {
    await deps.sends?.ask?.(request)
    deps.sends?.check(request)
  }

  async function guard(request: GuardRequest & { chatId: Id }, messageId?: Id): Promise<void> {
    const { chatId, kind, notify } = request
    try {
      await checked(request)
    } catch (error) {
      deps.sends?.record({
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

  async function changeChat<T>(
    chatId: Id | null,
    action: ChatAction,
    act: () => Promise<{ chatId: Id; result: T; people?: number }>,
    personIds?: Id[],
  ): Promise<T> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change a chat")

    try {
      await checked({ chatId, kind: "chat", action, ...(personIds ? { personIds } : {}) })
    } catch (error) {
      deps.sends?.record({ chatId, kind: "chat", action, outcome: "refused", errorCode: asCliError(error).code })
      throw error
    }

    try {
      await deps.connectOnce()
      const done = await act()
      deps.sends?.record({
        chatId: done.chatId,
        kind: "chat",
        action,
        outcome: "sent",
        ...(done.people === undefined ? {} : { people: done.people }),
      })
      return done.result
    } catch (error) {
      const failure = asCliError(error)
      deps.sends?.record({
        chatId,
        kind: "chat",
        action,
        outcome: failure.code === "outcome_unknown" ? "outcome_unknown" : "failed",
        errorCode: failure.code,
      })
      throw error
    }
  }

  async function updateMembers(
    reference: string,
    people: string[],
    action: ChatAction,
    change: Omit<RequestOf<typeof chatsUpdateMembers>, "chatId" | "userIds">,
  ): Promise<ChatChange> {
    const chatId = await deps.chatsResolve(reference)
    const userIds = await deps.personIds(people)
    return changeChat(
      chatId,
      action,
      async () => {
        const answer = await deps.wire.chats.updateMembers({ chatId, userIds, ...change })
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

  async function change<T>(action: AccountAction, body: (done: () => void) => Promise<T>): Promise<T> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot change the account")

    try {
      await checked({ chatId: null, kind: "account", action })
    } catch (error) {
      deps.sends?.record({
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
      if (operationId !== undefined) appliedOperations.add(operationId)
      deps.sends?.record({ chatId: null, kind: "account", action, outcome: "sent" })
    }

    try {
      await deps.connectOnce()
      const result = await body(done)
      done()
      return result
    } catch (error) {
      if (!recorded) {
        deps.sends?.record({
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

  function contactAction(action: AccountAction, wire: ContactWire, reference: string): Promise<Contact> {
    return change(action, async () => {
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
    checked: checked,
    guard: guard,
    botWrite: botWrite,
    changeChat: changeChat,
    updateMembers: updateMembers,
    change: change,
    contactAction: contactAction,
    nextCid: nextCid,
    takeApplied: takeApplied,
  }
}
