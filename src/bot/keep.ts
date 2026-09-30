import { CliError } from "@leemour/cli-core"
import type { Chat, Message } from "@leemour/cli-messaging"
import {
  type AccountKey,
  type IngestedVia,
  type MessageStore,
  openStore,
  type PersonFacts,
} from "@leemour/cli-messaging/store"
import type { ChatRegistry } from "./registry.js"

/** How a bot's messages are told apart from a personal account's in the shared store and its locators. */
export const PROVIDER = "max-bot"

const CHAT_ID = /^-?\d+$/

export const accountOf = (botId: string): AccountKey => ({ provider: PROVIDER, account: botId })

/**
 * Only a real chat and a real message: the fallback decoder says `unknown`, and `user:<id>` is a
 * send address — stored, either would make a chat that does not exist (`RISK-54`).
 */
const storable = (message: Message): boolean => CHAT_ID.test(message.chatId) && message.id.startsWith("mid.")

/** The reason, never the path — a home directory is nobody else's business. */
const reasonOf = (error: unknown): string => {
  const code = (error as { code?: unknown })?.code
  if (typeof code === "string") return code
  return error instanceof Error ? error.name : "an unknown problem"
}

/**
 * **A store that fails never fails the command** — MAX answered, and the answer is printed either
 * way; the reason goes to stderr. Returns whether it was saved, for `updates watch`, which must not
 * move its marker past what it failed to keep.
 */
const quietly = async (
  write: (store: MessageStore) => Promise<unknown>,
  warn: (message: string) => void,
): Promise<boolean> => {
  let store: MessageStore | undefined
  try {
    store = await openStore()
    await write(store)
    return true
  } catch (error) {
    warn(`the local copy was not updated: ${reasonOf(error)}`)
    return false
  } finally {
    await store?.close()
  }
}

export const keep = async (
  botId: string,
  messages: readonly Message[],
  via: IngestedVia,
  warn: (message: string) => void,
  senders: readonly PersonFacts[] = [],
): Promise<boolean> => {
  const byChat = new Map<string, Message[]>()
  for (const message of messages.filter(storable)) {
    byChat.set(message.chatId, [...(byChat.get(message.chatId) ?? []), message])
  }
  if (byChat.size === 0) return true
  return quietly(async (store) => {
    for (const [chatId, chatMessages] of byChat) {
      await store.saveMessages(accountOf(botId), chatId, chatMessages, { via })
    }
    await store.savePeople(accountOf(botId), [...senders])
  }, warn)
}

/**
 * Only a chat MAX has just described in full: the store replaces a title it is not given
 * (`RISK-53`), and the partial facts stay in the registry, which merges them.
 */
export const keepChat = async (botId: string | undefined, chat: Chat, warn: (message: string) => void) => {
  if (botId && CHAT_ID.test(chat.id)) await quietly((store) => store.saveChats(accountOf(botId), [chat]), warn)
}

/**
 * A message MAX says was deleted. The store keeps it as a tombstone: reads, `--offline` and
 * search stop returning it.
 */
export const forget = async (
  botId: string,
  removals: readonly { chatId: string; messageId: string }[],
  warn: (message: string) => void,
): Promise<boolean> => {
  const known = removals.filter((removal) => CHAT_ID.test(removal.chatId))
  if (known.length === 0) return true
  return quietly(async (store) => {
    for (const { chatId, messageId } of known) await store.markDeleted(accountOf(botId), [messageId], { chatId })
  }, warn)
}

/** A send's answer names the bot as its sender, so the store needs no `me()` to know whose it is. */
export const keepSent = async (registry: ChatRegistry, sent: unknown, warn: (message: string) => void) => {
  const message = sent as Partial<Message>
  if (typeof message?.senderId !== "string" || typeof message.id !== "string") return
  registry.rememberBot(message.senderId)
  await keep(message.senderId, [message as Message], "send", warn)
}

/** For `--offline` and `search`: here the store is the answer, so a failure is the command's failure. */
export const fromStore = async <T>(read: (store: MessageStore) => Promise<T>): Promise<T> => {
  let store: MessageStore
  try {
    store = await openStore()
  } catch (error) {
    throw new CliError("configuration_error", `the local copy cannot be opened: ${reasonOf(error)}`)
  }
  try {
    return await read(store)
  } finally {
    await store.close()
  }
}
