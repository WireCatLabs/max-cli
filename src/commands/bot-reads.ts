import { CliError } from "@wirecat/cli-core"
import { pickChat } from "@wirecat/cli-messaging"
import type { ChatRegistry } from "../bot/registry.js"

const CHAT_ID = /^-?\d+$/

/** An id as it is, or a title this bot has already seen — never a guess (ARCHITECTURE §9). */
export const chatIdOf = (reference: string, registry: ChatRegistry): string => {
  if (CHAT_ID.test(reference)) return reference
  if (reference.startsWith("user:")) {
    throw new CliError("validation_error", "a direct chat is read by its chat id; `user:<id>` is only for sending")
  }
  return pickChat(reference, registry.list()).id
}
