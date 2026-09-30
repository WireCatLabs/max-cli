import { CliError } from "@leemour/cli-core"
import { annotate } from "@leemour/cli-core/commands"
import { markReadCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import { ADMIN_RIGHTS, type AdminRight, EVENTS_DAYS, type MaxClient } from "../client.js"
import type { ChatKind, GroupSettings } from "../domain/models.js"
import { maxMessenger } from "../messenger.js"
import { checkCommand } from "./check.js"
import { forCommand } from "./context.js"
import { foldersCommand } from "./folders.js"
import { renderList, renderPage, window, withPaging } from "./paging.js"
import { rulesCommand } from "./rules.js"

export const chatsCommand = (): Command => {
  const command = new Command("chats").description("the chats this account is in")

  withPaging(command.command("list").description("the chats this account is in"))
    .option("--search <text>", "only chats whose name contains this; at least 3 characters")
    .option("--kind <dialog|group|channel>", "only chats of this kind")
    .option("--unread", "only chats with unread messages")
    .action(async function (this: Command) {
      const options = this.optsWithGlobals()
      const context = forCommand(this)
      const { renderer, settings, createClient, run } = context
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("chats list", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          renderPage(
            context,
            await client.chats.list({
              ...window(settings),
              ...(options.search === undefined ? {} : { query: String(options.search) }),
              ...(options.kind === undefined ? {} : { kind: chatKind(options.kind) }),
              ...(options.unread === true ? { unread: true } : {}),
            }),
          )
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  command
    .command("show")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("one chat: its kind, unread count, last message time, who is in it, and a group's settings")
    .action(async function (this: Command, chat: string) {
      const { renderer, settings, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

      await run("chats show", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })

        try {
          renderer.result(await client.chats.show(chat))
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  command
    .command("events")
    .argument("<chat>", "chat id, or part of a chat name")
    .option(
      "--since <id-or-time>",
      `from this message id, ISO 8601 time, or 2h / 1d ago; ${EVENTS_DAYS} days ago if not given`,
    )
    .option("--event <names>", "only these, comma-separated, as MAX names them: new, add, remove, pin…")
    .description("who joined, left, was added or removed, and by whom — from the chat's service messages")
    .action(async function (this: Command, chat: string) {
      const options = this.optsWithGlobals()
      const { renderer, settings, format, createClient, run } = forCommand(this)
      const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })
      const only =
        options.event === undefined
          ? undefined
          : new Set(
              String(options.event)
                .split(",")
                .map((e) => e.trim()),
            )

      await run("chats events", async (events) => {
        const client = createClient({ events, ...(cache ? { cache } : {}) })
        try {
          const found = await client.chats.events(
            chat,
            options.since === undefined ? {} : { since: client.messages.moment(String(options.since), "--since") },
          )
          const kept = only ? { ...found, events: found.events.filter((one) => only.has(one.event)) } : found

          if (format !== "pretty") {
            renderList(renderer, format, kept.events, { hasMore: kept.more, chatId: kept.chatId, since: kept.since })
          } else {
            renderer.stream(
              kept.events.map((one) => ({
                time: one.timestamp,
                event: one.event,
                by: one.by.name ?? one.by.id,
                people: one.people.map((person) => person.name ?? person.id).join(", "),
              })),
            )
          }
          if (kept.more) renderer.note(`more history than one run reads — run again with --since after the last one`)
        } finally {
          await client.close()
          await cache?.close()
        }
      })
    })

  command
    .command("inspect")
    .argument("<link>", "an invite link, https://max.ru/join/…, or a public one, https://max.ru/<name>")
    .description("what a link leads to, without joining it")
    .action(async function (this: Command, link: string) {
      await withClient(this, "chats inspect", (client) => client.chats.inspect(link))
    })

  annotate(command.command("join"), { mutates: true })
    .argument("<link>", "an invite link, https://max.ru/join/…, or a public one, https://max.ru/<name>")
    .description("join a group or channel by its link; the others in it see that you joined")
    .action(async function (this: Command, link: string) {
      await withClient(this, "chats join", (client) => client.chats.join(link))
    })

  command.addCommand(markReadCommand(maxMessenger))

  annotate(command.command("leave"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .description("leave a group or channel; the others in it see that you left")
    .action(async function (this: Command, chat: string) {
      await withClient(this, "chats leave", (client) => client.chats.leave(chat))
    })

  annotate(command.command("create"), { mutates: true })
    .argument("<title>", "the group's name")
    .argument("[person...]", "people to add: an id, or part of a name")
    .option("--channel", "a private channel instead of a group; people join it by its link")
    .description("create a group or a channel; the people added are told")
    .action(async function (this: Command, title: string, people: string[]) {
      const channel = this.opts<{ channel?: boolean }>().channel === true
      await withClient(this, "chats create", (client) => client.chats.create(title, people, { channel }))
    })

  const members = command.command("members").description("who is in a group or channel; add or remove people")
  members
    .command("list")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("everyone in a group or channel, from MAX: when their account was made and when they were last seen")
    .action(async function (this: Command, chat: string) {
      const { renderer, format, createClient, run } = forCommand(this)
      await run("chats members list", async (events) => {
        const client = createClient({ events })
        try {
          const found = await client.chats.members.list(chat)
          renderList(renderer, format, found.members, {
            hasMore: !found.complete,
            chatId: found.chatId,
            rolesKnown: found.rolesKnown,
          })
          if (!found.complete) renderer.note(`only the first ${found.members.length} members were read`)
          if (!found.rolesKnown) renderer.note("who is owner or admin is not known: the login did not carry this group")
        } finally {
          await client.close()
        }
      })
    })
  annotate(members.command("add"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<person...>", "an id, or part of a name")
    .option("--history", "the people added also see the messages from before they came")
    .description("add people; they are told")
    .action(async function (this: Command, chat: string, people: string[]) {
      const history = this.opts().history === true
      await withClient(this, "chats members add", (client) => client.chats.members.add(chat, people, { history }))
    })
  annotate(members.command("remove"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<person...>", "an id, or part of a name")
    .description("remove people; their messages stay")
    .action(async function (this: Command, chat: string, people: string[]) {
      await withClient(this, "chats members remove", (client) => client.chats.members.remove(chat, people))
    })

  const admins = command.command("admins").description("give or take back a member's admin rights")
  annotate(admins.command("add"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<person>", "an id, or part of a name")
    .requiredOption("--can <rights>", `what they may do, comma-separated: ${Object.keys(ADMIN_RIGHTS).join(", ")}`)
    .description("make a member an admin with these rights")
    .action(async function (this: Command, chat: string, person: string) {
      const rights = adminRights(String(this.opts().can))
      await withClient(this, "chats admins add", (client) => client.chats.admins.add(chat, person, rights))
    })

  annotate(admins.command("remove"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<person>", "an id, or part of a name")
    .description("take an admin's rights back; they stay a member")
    .action(async function (this: Command, chat: string, person: string) {
      await withClient(this, "chats admins remove", (client) => client.chats.admins.remove(chat, person))
    })

  const update = annotate(command.command("update"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .option("--title <title>", "the new name")
    .option("--description <text>", "the new description")
    .description("rename a group or channel, change its description, or turn one of its settings on or off")
  for (const [flag, , help] of SETTINGS) update.option(`--${flag} <on|off>`, help)
  update.action(async function (this: Command, chat: string) {
    const { title, description, ...rest } = this.opts() as { title?: string; description?: string }
    const changes = settingChanges(rest)
    const renaming = title !== undefined || description !== undefined
    if (!renaming && Object.keys(changes).length === 0) {
      throw new CliError(
        "validation_error",
        `nothing to change — give --title, --description or a setting: ${SETTINGS.map(([flag]) => `--${flag}`).join(", ")}`,
      )
    }
    await withClient(this, "chats update", async (client) => {
      // Two requests, not one: a title and settings together in one CHAT_UPDATE was never measured.
      const renamed = renaming
        ? await client.chats.update(chat, {
            ...(title === undefined ? {} : { title }),
            ...(description === undefined ? {} : { description }),
          })
        : undefined
      return Object.keys(changes).length === 0 ? renamed : client.chats.settings(chat, changes)
    })
  })

  const link = command.command("link").description("a group's invite link")
  link
    .command("show")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("the invite link, if you may see it")
    .action(async function (this: Command, chat: string) {
      await withClient(this, "chats link show", async (client) => {
        const { id, title, link: current } = await client.chats.settings(chat)
        if (current === null) {
          throw new CliError(
            "not_found",
            `${title ?? id} shows you no invite link — only admins, or members when the group allows it`,
          )
        }
        return { chatId: id, title, link: current }
      })
    })
  annotate(link.command("reset"), { mutates: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .description("replace the invite link; the old one stops working")
    .action(async function (this: Command, chat: string) {
      await withClient(this, "chats link reset", (client) => client.chats.resetLink(chat))
    })
  command.addCommand(foldersCommand())
  command.addCommand(rulesCommand())
  command.addCommand(checkCommand())

  return command
}

const withClient = async (command: Command, label: string, act: (client: MaxClient) => Promise<unknown>) => {
  const { renderer, settings, createClient, run } = forCommand(command)
  const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

  await run(label, async (events) => {
    const client = createClient({ events, ...(cache ? { cache } : {}) })
    try {
      renderer.result(await act(client))
    } finally {
      await client.close()
      await cache?.close()
    }
  })
}

const SETTINGS: [flag: string, key: keyof GroupSettings, help: string][] = [
  ["all-can-pin", "allCanPin", "every member may pin messages"],
  ["only-admins-add", "onlyAdminsAdd", "only admins may add members"],
  ["only-admins-call", "onlyAdminsCall", "only admins may start a call"],
  ["only-owner-edits-info", "onlyOwnerEditsInfo", "only the owner may change the name and photo"],
  ["members-see-link", "membersSeeLink", "members may see the invite link"],
]

const settingChanges = (options: Record<string, unknown>): Partial<GroupSettings> => {
  const changes: Partial<GroupSettings> = {}
  for (const [flag, key] of SETTINGS) {
    const value = options[key]
    if (value === undefined) continue
    if (value !== "on" && value !== "off") {
      throw new CliError("validation_error", `--${flag} takes on or off, not "${String(value)}"`)
    }
    changes[key] = value === "on"
  }
  return changes
}

const adminRights = (value: string): AdminRight[] => {
  const rights = value
    .split(",")
    .map((right) => right.trim())
    .filter((right) => right !== "")
  const unknown = rights.filter((right) => !(right in ADMIN_RIGHTS))
  if (rights.length === 0 || unknown.length > 0) {
    throw new CliError(
      "validation_error",
      `--can takes ${Object.keys(ADMIN_RIGHTS).join(", ")}${unknown.length > 0 ? `, not "${unknown.join(", ")}"` : ""}`,
    )
  }
  return rights as AdminRight[]
}

/**
 * `--kind` is checked here and refused by name, rather than passed through to return nothing.
 *
 * A value the tool does not know is a typo, and an empty list is the one answer a typo must never
 * produce — it is indistinguishable from "you are in no group chats".
 */
const chatKind = (value: unknown): ChatKind => {
  const wanted = String(value).toLowerCase()
  if (wanted === "dialog" || wanted === "group" || wanted === "channel") return wanted
  throw new CliError("validation_error", `--kind takes dialog, group or channel, not "${String(value)}"`)
}
