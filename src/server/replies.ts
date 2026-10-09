import { CliError } from "@leemour/cli-core"
import type { ChatKind, Id, Message } from "@leemour/cli-messaging"
import {
  NO_RULES,
  openRequestTask,
  type Replied,
  repliesPathFor,
  repliesStatePathFor,
  replyRenderer,
  replyTo,
  senderFacts,
} from "@leemour/cli-messaging/cli"
import { guardedWrite, levelFor, type SendGuard } from "@leemour/cli-messaging/sends"
import { type MessageStore, openStore } from "@leemour/cli-messaging/store"
import { MAX_APP } from "../app.js"
import type { MaxClient } from "../client.js"
import { resolveSettings } from "../config.js"
import type { MessageHit } from "../domain/models.js"

export interface RepliesOptions {
  profile: string
  env?: NodeJS.ProcessEnv
  /** ms: when the server began; what is older came in the catch-up and is never answered. */
  since: number
  owner: () => Id | undefined
  client: () => MaxClient | undefined
  guard: () => SendGuard
  note: (line: string) => void
}

/**
 * The owner's reply rules over what MAX pushes, through the shared step tg's `serve` uses — so only
 * senders the rules file's audience allows are answered, and only with `replies.send` at `allow`. One
 * message at a time: two at once would both read the limits before either counted its reply.
 */
export const serverReplies = ({ profile, env = process.env, since, owner, client, guard, note }: RepliesOptions) => {
  let queue = Promise.resolve()
  const controller = new AbortController()
  let opened: Promise<MessageStore> | undefined
  const sent: Record<string, number> = {}
  const skipped: Record<string, number> = {}
  const tasks: Record<string, number> = {}

  const handle = async (hit: MessageHit) => {
    const open = client()
    if (!open || controller.signal.aborted) return
    const answer: Replied = await replyTo(
      {
        rulesPath: repliesPathFor(MAX_APP, profile, env),
        statePath: repliesStatePathFor(MAX_APP, profile, env),
        provider: "max",
        owner: { id: owner() ?? null },
        since,
        allowed: () =>
          levelFor(resolveSettings({ profile }, { env }).permissions ?? {}, "replies.send").level === "allow",
        chatOf: async (chat) => {
          const found = (await open.chats.list()).items.find((one) => one.id === chat)
          return { id: chat, kind: (found?.kind ?? "unknown") as ChatKind, title: found?.title ?? null }
        },
        senderOf: async (person) => {
          const account = owner()
          if (account === undefined) return { isBot: false, isContact: false }
          opened ??= openStore({ env })
          const { isContact, botOf } = await senderFacts(await opened, { provider: "max", account })
          return { isBot: (await botOf(person)) === true, isContact: isContact(person) }
        },
        send: ({ chat, text, replyTo: to, sendId, origin }) =>
          guardedWrite(
            guard(),
            {
              chatId: chat,
              kind: "message",
              sendId,
              operationId: sendId,
              length: text.length,
              key: "replies.send",
              origin,
            },
            () => open.messages.send(chat, text, { cid: Number(sendId), ...(to === undefined ? {} : { replyTo: to }) }),
            (message) => ({ messageId: message.id }),
          ),
        newSendId: () => open.newSendId(),
        render: replyRenderer(MAX_APP, profile, () => resolveSettings({ profile }, { env }), env, note, {
          ai: true,
          signal: controller.signal,
        }),
        openTask: async (message) => {
          const account = owner()
          if (account === undefined)
            throw new CliError("authentication_error", "the account is not known for reply tasks")
          opened ??= openStore({ env })
          return openRequestTask(await opened, { provider: "max", account }, message)
        },
      },
      asShared(hit),
    )
    if (answer.task !== undefined) tasks[answer.task] = (tasks[answer.task] ?? 0) + 1
    if ("sent" in answer) sent[answer.sent] = (sent[answer.sent] ?? 0) + 1
    else if (answer.skip !== NO_RULES) skipped[answer.skip] = (skipped[answer.skip] ?? 0) + 1
  }

  return {
    arrived: (hit: MessageHit) => {
      if (hit.outgoing !== false) return
      queue = queue.then(() =>
        handle(hit).catch(() => note("a reply rule failed; check the replies file and send permissions")),
      )
    },
    settled: () => queue,
    stop: () => controller.abort(),
    close: async () => {
      controller.abort()
      await queue
      if (opened) await (await opened).close()
    },
    summary: () => ({ sent, skipped, ...(Object.keys(tasks).length ? { tasks } : {}) }),
  }
}

/** The rules read the text, the sender and what it answers — not attachments, which stay MAX's own. */
const asShared = ({
  chatTitle: _title,
  attachments: _attachments,
  replyTo,
  forwardedFrom: _forwarded,
  ...hit
}: MessageHit): Message =>
  ({
    ...hit,
    attachments: [],
    replyTo: replyTo && { ...replyTo, attachments: [] },
    forwardedFrom: null,
  }) as Message
