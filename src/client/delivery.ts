import { CliError, type SleepLike } from "@wirecat/cli-base"
import { namesFrom, toMessage } from "../domain/map.js"
import type { Id, Message } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { type Markup, parseMarkdown } from "../markdown.js"
import type { Payload } from "../protocol/frame.js"
import type { SessionStore } from "../session/store.js"
import type { Upload } from "./types.js"
import { asCliError, record, viewer } from "./values.js"

interface Dependencies {
  upload: (file: Upload) => Promise<Payload>
  connectOnce: () => Promise<void>
  session: () => Payload
  readonly wire: Pick<ReturnType<typeof wireClient>, "messages">
  readonly store: SessionStore
  readonly sleep: SleepLike
}
export const createDelivery = (deps: Dependencies) => {
  async function deliver(
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
    await deps.connectOnce()
    const session = deps.session()
    const attaches: unknown[] = [...(options.attaches ?? [])]
    for (const file of options.files ?? []) attaches.push(await deps.upload(file))
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
      answer = await untilAttachmentsReady(() => deps.wire.messages.send(request))
    } catch (error) {
      const failure = asCliError(error)
      if (failure.code !== "timeout" && failure.code !== "network_error") throw failure
      if (options.at !== undefined) {
        throw new CliError(
          "outcome_unknown",
          `the message may or may not have been scheduled (${failure.message}) — ` +
            `\`max messages scheduled ${chatId}\` shows the queue; sending it again could queue a second copy`,
          { send_id: cid },
        )
      }

      // No answer came back, so MAX may already have delivered it. Repeating the identical `cid`
      // is what makes asking again safe rather than reckless.
      try {
        answer = await deps.wire.messages.send(request)
      } catch {
        throw new CliError(
          "outcome_unknown",
          `the message may or may not have been sent (${failure.message}) — ` +
            `\`${options.repeat ?? "max messages send <chat> <text>"} --send-id ${cid}\` repeats the attempt without risking a second copy`,
          { send_id: cid },
        )
      }
    }

    const sent = record(answer.message) ?? answer
    return toMessage(sent, chatId, { names: namesFrom(session.contacts), ...viewer(deps.store) })
  }
  async function untilAttachmentsReady(send: () => Promise<Payload>): Promise<Payload> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await send()
      } catch (error) {
        if (attempt >= 30 || !asCliError(error).message.includes("attachment.not.ready")) throw error
        await deps.sleep(1000, undefined, "retry")
      }
    }
  }
  return { deliver }
}
