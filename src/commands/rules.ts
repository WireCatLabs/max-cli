import { annotate } from "@leemour/cli-core/commands"
import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import type { MaxClient } from "../client.js"
import { defaultRules, ModerationRules, moderationPathFor, RULE_KEYS } from "../moderation/rules.js"
import { forCommand } from "./context.js"

/**
 * A group's moderation rules: what `max chats check` flags and may act on (`NEED-308`, `NEED-309`).
 * Local only — nothing here reaches MAX but the lookup of the chat's id and title.
 */
export const rulesCommand = (): Command => {
  const command = new Command("rules").description("a group's moderation rules, kept on this machine")

  command
    .command("show")
    .argument("<chat>", "chat id, or part of a chat name")
    .description("the group's rules; the defaults, marked not saved, if it has none yet")
    .action(async function (this: Command, chat: string) {
      await withRules(this, "chats rules show", chat, (rules, group) => {
        const saved = rules.read(group.id)
        return { saved: saved !== undefined, rules: saved ?? undefined }
      })
    })

  annotate(command.command("set"), { mutates: true, local: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<key>", `one of: ${RULE_KEYS.join(", ")}`)
    .argument("<value>", "see `max chats rules show`; lists are comma-separated and replace the old one")
    .description("change one rule; the group's first change writes every rule with its default")
    .action(async function (this: Command, chat: string, key: string, value: string) {
      await withRules(this, "chats rules set", chat, (rules, group) => ({
        saved: true,
        rules: rules.set(group.id, group.title, key, value),
      }))
    })

  annotate(command.command("unset"), { mutates: true, local: true })
    .argument("<chat>", "chat id, or part of a chat name")
    .argument("<key>", `one of: ${RULE_KEYS.join(", ")}`)
    .description("put one rule back to its default")
    .action(async function (this: Command, chat: string, key: string) {
      await withRules(this, "chats rules unset", chat, (rules, group) => ({
        saved: true,
        rules: rules.unset(group.id, group.title, key),
      }))
    })

  return command
}

const withRules = async (
  command: Command,
  label: string,
  chat: string,
  act: (rules: ModerationRules, group: { id: string; title: string | null }) => { saved: boolean; rules?: unknown },
) => {
  const { renderer, settings, createClient, run } = forCommand(command)
  const cache = await openProfileCache(settings.profile, { onProblem: (message) => renderer.note(message) })

  await run(label, async (events) => {
    const client: MaxClient = createClient({ events, ...(cache ? { cache } : {}) })
    try {
      const group = await client.chats.show(chat)
      const rules = new ModerationRules(moderationPathFor(settings.profile))
      const { saved, rules: current } = act(rules, group)
      renderer.result({
        chatId: group.id,
        title: group.title,
        file: rules.path,
        saved,
        rules: current ?? defaultRules(group.title),
      })
    } finally {
      await client.close()
      await cache?.close()
    }
  })
}
