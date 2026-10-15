import { CliError } from "@wirecat/cli-base"
import type { Id, Message, Poll } from "@wirecat/cli-core"
import { POLL_CLOSED, pollSettings, toPoll } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Markup } from "../markdown.js"
import type { Payload } from "../protocol/frame.js"
import type { Upload } from "./types.js"
import { asArray, asCliError, record } from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  poll: (chatId: Id, messageId: Id) => Promise<{ attach: Payload; poll: Poll; pollId: Id; outgoing: boolean }>
  readonly offline: boolean
  readonly wire: Pick<ReturnType<typeof wireClient>, "messages">
  nextCid: () => number
  deliver: (
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
  ) => Promise<Message>
  readonly warn: (message: string) => void
}

export const createPolls = (deps: Dependencies) => {
  const resource = {
    show: async (chatId: Id, messageId: Id): Promise<Poll> => {
      await deps.connectOnce()
      return (await deps.poll(chatId, messageId)).poll
    },
    vote: async (chatId: Id, messageId: Id, answerIds: Id[]): Promise<Poll> => {
      if (deps.offline) throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot vote")

      try {
        await deps.connectOnce()
        const { attach, poll, pollId } = await deps.poll(chatId, messageId)
        const voted = poll.answers.some((answer) => answer.chosen)
        if (answerIds.length === 0 && !voted) {
          throw new CliError("validation_error", `you have not voted in the poll of message ${messageId}`)
        }
        if (answerIds.length === 0 && !poll.revote) {
          throw new CliError("validation_error", `the poll of message ${messageId} does not let a vote be taken back`)
        }
        if (answerIds.length > 0 && voted && !poll.revote) {
          throw new CliError(
            "validation_error",
            `you have voted in the poll of message ${messageId}, and it does not let a vote change`,
          )
        }
        if (answerIds.length > 1 && !poll.multiple) {
          throw new CliError(
            "validation_error",
            `the poll of message ${messageId} takes one answer, not ${answerIds.length}`,
          )
        }
        const unknown = answerIds.find((id) => !poll.answers.some((answer) => answer.id === id))
        if (unknown !== undefined) {
          throw new CliError(
            "validation_error",
            `the poll of message ${messageId} has no answer ${unknown} — its answers are ${poll.answers.map((answer) => answer.id).join(", ")}`,
          )
        }

        const answer = await deps.wire.messages.pollVote({
          chatId,
          messageId,
          pollId,
          answersIds: answerIds.map(Number),
        })
        const state = record(answer.state)
        return (state && toPoll({ ...attach, state }, chatId, messageId)) ?? poll
      } catch (error) {
        const failure = asCliError(error)
        if (answerIds.length > 0 && failure.details.provider_error === "poll.already.voted") {
          throw new CliError(
            failure.code,
            `${failure.message}; if this poll allows changing votes, run \`polls vote <chat> <message> --retract\` in the same profile before voting again`,
            failure.details,
          )
        }
        throw error
      }
    },
    close: async (chatId: Id, messageId: Id): Promise<Poll> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot close a poll")
      await deps.connectOnce()
      const { attach, poll, outgoing } = await deps.poll(chatId, messageId)
      if (!outgoing) throw new CliError("validation_error", `the poll of message ${messageId} is not yours to close`)

      // What the web client sends back: the answers' text only, no ids and no votes.
      const closed = {
        _type: "POLL",
        pollId: attach.pollId,
        title: attach.title,
        answers: asArray(attach.answers).map((each) => ({ text: each.text })),
        settings: (typeof attach.settings === "number" ? attach.settings : 0) | POLL_CLOSED,
      }
      const answer = await deps.wire.messages.edit({ chatId, messageId, attachments: [closed] })
      const after = asArray(record(answer.message)?.attaches).find((each) => each._type === "POLL")
      return (after && toPoll(after, chatId, messageId)) ?? { ...poll, closed: true }
    },
    create: async (
      chatId: Id,
      question: string,
      answers: string[],
      options: { multiple?: boolean; anonymous?: boolean; revote?: boolean; cid?: number; notify?: boolean } = {},
    ): Promise<Message> => {
      if (deps.offline)
        throw new CliError("validation_error", "`--offline` reads what was recorded; it cannot create a poll")
      if (question.trim() === "") throw new CliError("validation_error", "a poll needs a question")
      if (answers.length < 2 || answers.some((answer) => answer.trim() === "")) {
        throw new CliError("validation_error", "a poll needs at least two answers, none of them empty")
      }

      const attach = {
        _type: "POLL",
        title: question,
        answers: answers.map((text) => ({ text })),
        settings: pollSettings(options),
      }
      const sent = await deps.deliver(chatId, "", options.cid ?? deps.nextCid(), {
        ...options,
        attaches: [attach],
        repeat: `max polls create ${chatId} …`,
      })
      deps.warn("web.max.ru does not show polls: anyone reading this chat in a browser sees «Обновите MAX…»")
      return sent
    },
  }
  return { show: resource.show, vote: resource.vote, close: resource.close, create: resource.create }
}
