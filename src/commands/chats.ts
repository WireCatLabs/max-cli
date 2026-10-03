import { markReadCommand, chatsCommand as sharedChatsCommand } from "@leemour/cli-messaging/cli"
import { Command } from "commander"
import { EVENTS_DAYS, type MaxClient } from "../client.js"
import { maxMessenger, sharedSubcommand } from "../messenger.js"
import { maxRecord } from "../record.js"
import { checkCommand } from "./check.js"
import { forCommand } from "./context.js"
import { renderList } from "./paging.js"
import { rulesCommand } from "./rules.js"

export const chatsCommand = (): Command => {
  const command = new Command("chats").description("the chats this account is in")

  const shared = sharedChatsCommand(maxMessenger)
  command.addCommand(sharedSubcommand(shared, "list"))
  command.addCommand(sharedSubcommand(shared, "show"))

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
      const { renderer, format, createClient, run, store } = forCommand(this)
      const record = maxRecord({ account: () => store.readState().viewerId })
      const only =
        options.event === undefined
          ? undefined
          : new Set(
              String(options.event)
                .split(",")
                .map((e) => e.trim()),
            )

      await run("chats events", async (events) => {
        const client = createClient({ events, record })
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
          await record.close()
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

  command.addCommand(sharedSubcommand(shared, "join"))

  command.addCommand(markReadCommand(maxMessenger))

  command.addCommand(sharedSubcommand(shared, "leave"))
  command.addCommand(sharedSubcommand(shared, "create"))

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
  const sharedMembers = sharedSubcommand(shared, "members")
  members.addCommand(sharedSubcommand(sharedMembers, "add"))
  members.addCommand(sharedSubcommand(sharedMembers, "remove"))
  command.addCommand(sharedSubcommand(shared, "admins"))
  command.addCommand(sharedSubcommand(shared, "update"))
  command.addCommand(sharedSubcommand(shared, "link"))
  command.addCommand(sharedSubcommand(shared, "folders"))
  command.addCommand(rulesCommand())
  command.addCommand(checkCommand())

  return command
}

const withClient = async (command: Command, label: string, act: (client: MaxClient) => Promise<unknown>) => {
  const { renderer, createClient, run, store } = forCommand(command)
  const record = maxRecord({ account: () => store.readState().viewerId })

  await run(label, async (events) => {
    const client = createClient({ events, record })
    try {
      renderer.result(await act(client))
    } finally {
      await client.close()
      await record.close()
    }
  })
}
