import { CliError, singleLine } from "@leemour/cli-core"
import {
  type Contact,
  type Message,
  type PersonCard,
  parseLocator,
  pickPerson,
  renderMessages,
} from "@leemour/cli-messaging"
import type { MessageStore, StoredHit } from "@leemour/cli-messaging/store"
import { Command } from "commander"
import { accountOf, fromStore, keep, PROVIDER } from "../bot/keep.js"
import { KINDS } from "../bot/map.js"
import { ChatRegistry, registryProfiles } from "../bot/registry.js"
import { asFirstWord } from "../profile.js"
import { botContext } from "./bot-context.js"
import { wholeNumber } from "./paging.js"

type Context = ReturnType<typeof botContext>

/** What "common chats" rests on: who has written where in this copy, not who is a member. */
const BASIS = "messages seen"

/** What a read may reach beyond this bot: `--all-bots`, or `--bots` naming some (owner, 2026-09-29). */
export interface Across {
  allBots?: boolean
  bots?: string[]
}

type PeopleScope = { account: string } | { accounts: string[] }

/**
 * This bot's copy, or — when the command asks and `readOtherBots` allows — other bots' copies too.
 * Identities are per provider, so a person is the same in all of them.
 */
const scopeOf = (context: Context, across: Across = {}) => {
  const own = context.registry.botId()
  const asked = across.allBots === true || (across.bots?.length ?? 0) > 0
  if (!asked) {
    if (!own) {
      throw new CliError(
        "not_found",
        "nothing is recorded for this bot on this machine — run `bot messages list <chat>` once",
      )
    }
    return { filter: { account: accountOf(own) }, people: { account: own } as PeopleScope }
  }
  const profile = context.settings.profile
  const allowed = context.settings.readOtherBots
  const fix = `max ${asFirstWord(profile)}config set --bot readOtherBots true, or a list of bots`
  if (allowed === false) {
    throw new CliError(
      "permission_error",
      `profile ${profile} may not read other bots' copies (readOtherBots is off, from the ` +
        `${context.settings.sources.readOtherBots}) — to allow it: ${fix}`,
    )
  }
  const named = across.allBots ? (allowed === true ? registryProfiles() : [...allowed]) : (across.bots ?? [])
  if (allowed !== true) {
    const refused = named.filter((name) => !allowed.includes(name))
    if (refused.length > 0) {
      throw new CliError(
        "permission_error",
        `profile ${profile} may read only ${allowed.join(", ") || "no other bot"} (readOtherBots) — not ${refused.join(", ")}`,
      )
    }
  }
  const ids = named
    .filter((name) => name !== profile)
    .flatMap((name) => {
      const id = new ChatRegistry(name).botId()
      if (id) return [id]
      if (across.allBots) return []
      throw new CliError("not_found", `nothing is recorded for bot ${name} on this machine`)
    })
  const accounts = [...new Set([...(own ? [own] : []), ...ids])]
  return { filter: { provider: PROVIDER, accounts }, people: { accounts } as PeopleScope }
}

/** `--all-bots` and `--bots`, on every command that reads the copy by person or text. */
export const acrossOptions = (command: Command): Command =>
  command
    .option("--all-bots", "also read every other bot's copy on this machine that readOtherBots allows")
    .option(
      "--bots <profiles>",
      "also read these bots' copies, comma separated — each allowed by readOtherBots",
      (value) =>
        value
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
    )

const resolve = (store: MessageStore, references: string[], scope: PeopleScope): Contact[] => {
  const people = store.people(PROVIDER, scope)
  return references.map((reference) => pickPerson(reference, people))
}

/** Two bots in one group keep a copy each; the reader wants the message once. */
const once = <T extends Message>(messages: T[]): T[] => {
  const seen = new Set<string>()
  return messages.filter((message) => {
    const key = `${message.chatId} ${message.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const byTime = (a: Message, b: Message) => a.timestamp.localeCompare(b.timestamp)

const messagesText = (context: Context, messages: Message[]) =>
  renderMessages(messages, {
    verbosity: context.settings.detail,
    color: context.color,
    profile: context.settings.profile,
    provider: PROVIDER,
  })

const nameLine = (person: Contact) =>
  singleLine(
    [person.name ?? "(no name)", person.username && `@${person.username}`, person.id].filter(Boolean).join("  "),
  )

const cardOf = (store: MessageStore, context: Context, who: string, across: Across, limit: number) => {
  const { filter, people } = scopeOf(context, across)
  const [person] = resolve(store, [who], people) as [Contact]
  const rows = store.find({ ...filter, senders: [person.id], perChat: true, limit: 1 }).items
  const latest = rows.filter((hit, index) => rows.findIndex((other) => other.chatId === hit.chatId) === index)
  const kindOf = (hit: StoredHit) => KINDS[String(hit.providerMetadata?.chatType)] ?? "unknown"
  const dialogs = latest.filter((hit) => kindOf(hit) === "dialog")
  const messages = dialogs
    .flatMap((hit) => {
      const { account: bot } = parseLocator(hit.locator)
      return store.messages({ provider: PROVIDER, account: bot }, hit.chatId, { limit }).items
    })
    .toSorted(byTime)
  const card: PersonCard & { messages: Message[] } = {
    ...person,
    chats: latest.map((hit) => ({
      id: hit.chatId,
      title: hit.chatTitle,
      kind: kindOf(hit),
      lastMessageAt: hit.timestamp,
    })),
    messages: messages.slice(-limit),
  }
  return { card, dialogs }
}

export const peopleCommand = (): Command => {
  const command = new Command("people").description(
    "people this bot has seen write — from the local copy on this machine, never asking MAX unless told to",
  )

  acrossOptions(command.command("show <who>"))
    .option("--limit <n>", "how many messages from the private chat", wholeNumber("--limit"))
    .option("--refresh", "read the private chat with them from MAX first — one request")
    .description(
      "one person — an id, @username or part of a name: the chats they wrote in (with their last message " +
        "there) and the latest messages of their private chat with the bot",
    )
    .action(async function (this: Command, who: string, options: Across & { refresh?: boolean }) {
      const context = botContext(this, { offline: true })
      if (options.refresh && context.offline)
        throw new CliError("validation_error", "--refresh asks MAX; drop --offline")
      const across = { allBots: options.allBots === true, bots: options.bots ?? [] }
      const limit = context.settings.limit
      const first = await fromStore((store) => cardOf(store, context, who, across, limit))
      let card = first.card
      if (options.refresh) {
        const self = context.registry.botId()
        const ours = first.dialogs.find((hit) => self && parseLocator(hit.locator).account === self)
        if (!self || !ours) {
          context.streams.diagnostic("no private chat with them is recorded for this bot — nothing to refresh")
        } else {
          const client = context.authenticated()
          const fresh = await client.messages(ours.chatId, Math.min(limit, 100), self)
          await keep(self, fresh, "history", context.streams.diagnostic, client.takeSenders())
          card = (await fromStore((store) => cardOf(store, context, who, across, limit))).card
        }
      }
      if (context.format !== "pretty") {
        context.renderer.result(card)
        return
      }
      const chats = card.chats.map(
        (chat) => `  ${chat.id}  ${chat.kind}  ${singleLine(chat.title ?? "")}  ${chat.lastMessageAt ?? ""}`,
      )
      context.streams.data([nameLine(card), ...chats, "", messagesText(context, card.messages)].join("\n"))
    })

  return command
}

/** `bot messages search --from`: every message from any of them, with or without text. */
export const searchMessages = (
  context: Context,
  text: string | undefined,
  from: string[] = [],
  across: Across = {},
): Promise<{ items: StoredHit[]; hasMore: boolean }> => {
  const { filter, people } = scopeOf(context, across)
  return fromStore((store) => {
    const senders = resolve(store, from, people).map(({ id }) => id)
    return store.find({
      ...filter,
      ...(text === undefined ? {} : { text }),
      ...(senders.length ? { senders } : {}),
      limit: context.settings.limit,
    })
  })
}

export const addBetween = (messages: Command): void => {
  acrossOptions(messages.command("between <people...>"))
    .option("--limit <n>", "how many of the latest messages from each chat", wholeNumber("--limit"))
    .description(
      "what two or more people wrote in the chats they have all written in — from the local copy, grouped by " +
        "chat, oldest first; --limit counts per chat. Common chats are the ones this copy saw each of them " +
        "write in, not a member list from MAX",
    )
    .action(async function (this: Command, references: string[], options: Across) {
      const context = botContext(this, { offline: true })
      if (references.length < 2) throw new CliError("validation_error", "name at least two people")
      const { filter, people } = scopeOf(context, options)
      const page = await fromStore((store) => {
        const senders = resolve(store, references, people).map(({ id }) => id)
        return store.find({ ...filter, senders, together: true, perChat: true, limit: context.settings.limit })
      })
      const chats = new Map<string, { id: string; title: string | null; messages: StoredHit[] }>()
      for (const hit of once(page.items)) {
        const chat = chats.get(hit.chatId) ?? { id: hit.chatId, title: hit.chatTitle, messages: [] }
        chat.messages.push(hit)
        chats.set(hit.chatId, chat)
      }
      const limit = context.settings.limit
      const grouped = [...chats.values()].map((chat) => ({
        ...chat,
        messages: chat.messages.toSorted(byTime).slice(-limit),
      }))
      if (context.format !== "pretty") {
        context.renderer.result({ basis: BASIS, chats: grouped, hasMore: page.hasMore })
        return
      }
      const blocks = grouped.map(
        (chat) => `${chat.id}  ${singleLine(chat.title ?? "")}\n${messagesText(context, chat.messages)}`,
      )
      context.streams.data(blocks.join("\n\n"))
    })
}
