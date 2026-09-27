import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, writeSecurely } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import type { Message } from "@leemour/cli-messaging"
import { Command } from "commander"
import type { BotApiClient } from "../bot/client.js"
import { JoinLog } from "../bot/joins.js"
import { forget } from "../bot/keep.js"
import { botsDirectory } from "../bot/registry.js"
import type { GroupMember } from "../domain/models.js"
import {
  type CheckRow,
  describe,
  finish,
  type Gathered,
  judge,
  MAX_ACTIONS,
  type Moderator,
  type Prepared,
  type SavedPoints,
} from "../moderation/check.js"
import { defaultRules, ModerationRules, moderationPathFor, RULE_KEYS } from "../moderation/rules.js"
import { botContext } from "./bot-context.js"
import { chatIdOf } from "./bot-reads.js"
import { guardedCall, operation } from "./bot-sends.js"
import { environmentOf } from "./context.js"

type Context = ReturnType<typeof botContext>

const FIRST_LOOK_MS = 24 * 3_600_000
const PAGE = 100
const READ_AT_MOST = 2000

/**
 * `max <bot> bot chats check` — the group check of `max chats check`, done by the bot (plan
 * `2026-09-27-bot-moderation-plan.md`). Removing bans unless `--no-ban` (`NEED-336`); joins come
 * from what `bot updates watch` kept (`NEED-338`); account age is not in the Bot API, so that rule
 * never fires here.
 */
export const botCheckCommand = (): Command =>
  annotate(new Command("check"), { mutates: true })
    .argument("<chat>", "chat id, or the title of a chat this bot has seen")
    .option("--since <time>", "judge what came after this ISO 8601 time; the saved point stays")
    .option("--dry-run", "judge and plan; do nothing")
    .option("--allow-dangerous", "do what a rule at consent level flag asks: delete messages, remove people")
    .option("--no-ban", "remove without banning; by default a removed person cannot come back by the link")
    .option("--max-actions <n>", `at most this many actions in one check; ${MAX_ACTIONS} if not given`)
    .description("judge a group's new messages and joins by its rules, and act as they allow — as the bot")
    .action(async function (this: Command, chat: string) {
      const context = botContext(this)
      const options = this.opts<{
        since?: string
        dryRun?: boolean
        allowDangerous?: boolean
        ban: boolean
        maxActions?: string
      }>()
      const maxActions = options.maxActions === undefined ? MAX_ACTIONS : Number(options.maxActions)
      if (!Number.isInteger(maxActions) || maxActions < 0) {
        throw new CliError("validation_error", `--max-actions takes a whole number — got ${options.maxActions}`)
      }
      const explicit = options.since === undefined ? undefined : Date.parse(options.since)
      if (explicit !== undefined && Number.isNaN(explicit)) {
        throw new CliError("validation_error", `--since takes an ISO 8601 time — got ${options.since}`)
      }

      const client = context.authenticated()
      const self = (await client.me()).user_id
      context.registry.rememberBot(self)
      const chatId = chatIdOf(chat, context.registry)
      const title = context.registry.list().find((one) => one.id === chatId)?.title ?? null
      const profile = context.settings.profile
      const saved = new ModerationRules(moderationPathFor(profile)).read(chatId)
      const rules = saved ?? defaultRules(title)
      const points = botPoints(profile)
      const point = points.read(chatId)
      const since = explicit ?? (point === undefined ? Date.now() - FIRST_LOOK_MS : Date.parse(point))

      const found = await gather(context, client, self, chatId, since)
      const prepared: Prepared = {
        chatId,
        title,
        rules,
        found,
        findings: judge({ ...found, rules, now: Date.now() }),
        explicit: explicit !== undefined,
        notes: [...(saved ? [] : [`${title ?? chatId} has no rules yet — the defaults only report`]), ...found.notes],
      }
      const interactive =
        environmentOf(this).interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true)
      const { rows, notes } = await finish(moderator(context, self, options.ban), points, prepared, {
        allowDangerous: options.allowDangerous === true,
        dryRun: options.dryRun === true,
        maxActions,
        ...(interactive
          ? {
              confirm: async (finding) => /^y(es)?$/i.test((await context.ask(`${describe(finding)}? [y/N] `)).trim()),
            }
          : {}),
      })
      context.renderer.stream(context.format === "pretty" ? rows.map(pretty) : rows)
      for (const note of notes) context.streams.diagnostic(note)
    })

/**
 * New messages since `since`, oldest first. MAX answers newest first (`BUG-59`), so this walks back
 * with `before` until a page comes short; past `READ_AT_MOST` only the newest are judged.
 */
const readSince = async (
  client: BotApiClient,
  self: string,
  chatId: string,
  since: number,
): Promise<{ messages: Message[]; more: boolean }> => {
  const read = new Map<string, Message>()
  let before: number | undefined
  while (read.size < READ_AT_MOST) {
    const answer = (await client.call(operation("getMessages"), {
      query: {
        chat_id: chatId,
        count: String(PAGE),
        after: String(since),
        ...(before === undefined ? {} : { before: String(before) }),
      },
    })) as { messages?: unknown[] } | null
    const page = (answer?.messages ?? []).map((raw) => client.decodeMessage(raw, self))
    for (const message of page) read.set(message.id, message)
    const oldest = page.at(-1)
    if (page.length < PAGE || !oldest) return { messages: oldestFirst(read), more: false }
    before = Date.parse(oldest.timestamp)
  }
  return { messages: oldestFirst(read), more: true }
}

const oldestFirst = (read: Map<string, Message>): Message[] =>
  [...read.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

const gather = async (
  context: Context,
  client: BotApiClient,
  self: string,
  chatId: string,
  since: number,
): Promise<Gathered> => {
  const notes: string[] = []
  const { messages, more } = await readSince(client, self, chatId, since)
  if (more)
    notes.push(
      `more than ${READ_AT_MOST} messages since ${new Date(since).toISOString()} — only the newest were judged`,
    )

  const admins = (await client.call(operation("getAdmins"), { path: { chatId } })) as {
    members?: { user_id?: unknown }[]
  } | null
  const answerers = new Set((admins?.members ?? []).map((member) => String(member.user_id)))

  const log = JoinLog.for(context.settings.profile)
  if (!log.kept()) notes.push("no joins kept for this bot — run `bot updates watch` to have them judged")
  const joined: GroupMember[] = log
    .read()
    .filter((entry) => entry.chatId === chatId && entry.event === "add" && entry.at > since)
    .map((entry) => ({ id: entry.userId, name: entry.name, username: null, registeredAt: null, lastSeenAt: null }))

  return {
    messages: messages as Gathered["messages"],
    joined,
    answerers,
    until: messages.at(-1)?.timestamp ?? null,
    more,
    notes,
  }
}

const moderator = (context: Context, self: string, ban: boolean): Moderator => ({
  deleteMessage: async (chatId, messageId) => {
    await guardedCall(context, operation("deleteMessage"), { query: { message_id: messageId } })
    await forget(self, [{ chatId, messageId }], context.streams.diagnostic)
  },
  removePerson: async (chatId, personId) => {
    await guardedCall(context, operation("removeMember"), {
      path: { chatId },
      query: { user_id: personId, ...(ban ? { block: "true" } : {}) },
    })
  },
})

/** Beside the bot's other state, one file per bot profile. */
const botPoints = (profile: string): SavedPoints => {
  const path = join(botsDirectory(), "checks", `${profile}.json`)
  const all = (): Record<string, string> =>
    existsSync(path)
      ? ((JSON.parse(readFileSync(path, "utf8")) as { points?: Record<string, string> }).points ?? {})
      : {}
  return {
    read: (chatId) => all()[chatId],
    write: (chatId, at) => writeSecurely(path, `${JSON.stringify({ points: { ...all(), [chatId]: at } })}\n`, 0o600),
  }
}

const pretty = (row: CheckRow) => ({
  what: row.kind,
  who: row.personName ?? row.personId,
  rule: row.rule,
  action: row.action,
  outcome: row.outcome,
  ...(row.reason ? { why: row.reason } : {}),
})

/** The same rules file as `max chats rules`, the chat named the bot's way. */
export const botRulesCommand = (): Command => {
  const command = new Command("rules").description("a chat's moderation rules for this bot, kept on this machine")
  const show = (context: Context, chatId: string, rules: ModerationRules) => {
    const saved = rules.read(chatId)
    const title = context.registry.list().find((one) => one.id === chatId)?.title ?? null
    context.renderer.result({
      chatId,
      title,
      file: rules.path,
      saved: saved !== undefined,
      rules: saved ?? defaultRules(title),
    })
  }
  const target = (command: Command, chat: string) => {
    const context = botContext(command, { offline: true })
    const chatId = chatIdOf(chat, context.registry)
    const title = context.registry.list().find((one) => one.id === chatId)?.title ?? null
    return { context, chatId, title, rules: new ModerationRules(moderationPathFor(context.settings.profile)) }
  }

  command
    .command("show <chat>")
    .description("the chat's rules; the defaults, marked not saved, if it has none yet")
    .action(function (this: Command, chat: string) {
      const { context, chatId, rules } = target(this, chat)
      show(context, chatId, rules)
    })
  command
    .command("set <chat> <key> <value>")
    .description(`change one rule — ${RULE_KEYS.join(", ")}`)
    .action(function (this: Command, chat: string, key: string, value: string) {
      const { context, chatId, title, rules } = target(this, chat)
      rules.set(chatId, title, key, value)
      show(context, chatId, rules)
    })
  command
    .command("unset <chat> <key>")
    .description("put one rule back to its default")
    .action(function (this: Command, chat: string, key: string) {
      const { context, chatId, title, rules } = target(this, chat)
      rules.unset(chatId, title, key)
      show(context, chatId, rules)
    })
  return command
}
