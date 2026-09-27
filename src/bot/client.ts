import { CliError } from "@leemour/cli-core"
import type { ManifestOperation } from "@leemour/cli-core/codegen"
import type { Chat, Message } from "@leemour/cli-messaging"
import * as v from "valibot"
import { operations } from "./generated/manifest.js"
import { BotInfo, Chat as ChatSchema, Message as MessageSchema } from "./generated/schemas.js"
import type { BotInfo as BotInfoType, Message as BotMessage } from "./generated/types.js"
import { toChat, toMessage } from "./map.js"
import { BotTransport, type CallInput, plainJson, type TransportOptions } from "./transport.js"

/** Every operation of the committed schema, as the manifest describes it. */
export const botOperations: readonly ManifestOperation[] = operations

const operationById = new Map(operations.map((operation) => [operation.id, operation]))

const required = (id: string): ManifestOperation => {
  const operation = operationById.get(id)
  if (!operation) throw new CliError("configuration_error", `the generated manifest has no operation ${id}`)
  return operation
}

/** The one door to the Bot API: generated operations stay behind it. */
export class BotApiClient {
  readonly #transport: BotTransport

  constructor(options: TransportOptions) {
    this.#transport = new BotTransport(options)
  }

  async me(): Promise<BotInfoType> {
    const answer = await this.#transport.call(required("getMyInfo"))
    const parsed = v.safeParse(BotInfo, answer)
    if (!parsed.success) {
      throw new CliError("invalid_response", "MAX answered getMyInfo in a shape this version does not know", {
        operation: "getMyInfo",
        fields: parsed.issues.map((issue) => v.getDotPath(issue) ?? "(root)"),
      })
    }
    return parsed.output
  }

  async chat(chatId: string): Promise<Chat> {
    const answer = await this.#transport.call(required("getChat"), { path: { chatId } })
    return toChat(this.#decode(ChatSchema, answer, "getChat"))
  }

  async message(messageId: string, selfId?: string): Promise<Message> {
    const answer = await this.#transport.call(required("getMessageById"), { path: { messageId } })
    return this.#message(answer, selfId)
  }

  /** Newest last, as MAX returns them. */
  async messages(chatId: string, count: number, selfId?: string): Promise<Message[]> {
    const answer = (await this.#transport.call(required("getMessages"), {
      query: { chat_id: chatId, count: String(count) },
    })) as { messages?: unknown[] } | null
    return (answer?.messages ?? []).map((raw) => this.#message(raw, selfId))
  }

  call(operation: ManifestOperation, input: CallInput): Promise<unknown> {
    return this.#transport.call(operation, input)
  }

  #decode<T>(schema: v.GenericSchema<unknown, T>, answer: unknown, operation: string): T {
    const parsed = v.safeParse(schema, answer)
    if (!parsed.success) {
      throw new CliError("invalid_response", `MAX answered ${operation} in a shape this version does not know`, {
        operation,
        fields: parsed.issues.map((issue) => v.getDotPath(issue) ?? "(root)"),
      })
    }
    return parsed.output
  }

  /**
   * One message MAX added something new to (an attachment type newer than the schema, `RISK-51`)
   * still shows its text and time rather than failing the whole list.
   */
  #message(raw: unknown, selfId?: string): Message {
    const parsed = v.safeParse(MessageSchema, raw)
    if (parsed.success) return toMessage(parsed.output as BotMessage, selfId)
    const loose = plainJson(raw) as {
      body?: { mid?: string; text?: string; seq?: unknown }
      timestamp?: number
      recipient?: { chat_id?: unknown }
    }
    return {
      id: String(loose.body?.mid ?? "unknown"),
      chatId: String(loose.recipient?.chat_id ?? "unknown"),
      senderId: null,
      senderName: null,
      timestamp: new Date(Number(loose.timestamp ?? 0)).toISOString(),
      editedAt: null,
      text: loose.body?.text ?? "",
      outgoing: null,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
      providerMetadata: { unparsed: parsed.issues.map((issue) => v.getDotPath(issue) ?? "(root)") },
    }
  }
}
