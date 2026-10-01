import { Command } from "commander"
import { openProfileCache } from "../cache/index.js"
import { maxRecord } from "../record.js"
import { forCommand } from "./context.js"

/**
 * The way out, and it matters more than it looks.
 *
 * Everything else in this tool can be re-run; a cache is the one part that remembers being wrong.
 * While the schema is still moving, the fix for a cache that misbehaves has to be a command rather
 * than finding a file and deleting it.
 */
export const cacheCommand = (): Command => {
  const command = new Command("cache").description("the local copy of chats, contacts and messages")

  command
    .command("clear")
    .description("forget everything this profile has cached")
    .option("--left", "only the chats this account has left, with their messages")
    .action(async function (this: Command) {
      const { settings, renderer, store } = forCommand(this)
      const { profile } = settings
      if (this.opts<{ left?: boolean }>().left) {
        const cache = await openProfileCache(profile, { onProblem: (message) => renderer.note(message) })
        try {
          const chats = (await cache?.chats.clearLeft()) ?? 0
          renderer.result({ profile, cleared: chats > 0, chats })
          if (chats > 0) renderer.success(`forgot ${chats} chat(s) "${profile}" has left`)
          else renderer.note("no chats this profile has left are cached")
        } finally {
          await cache?.close()
        }
        return
      }
      const record = maxRecord({ account: () => store.readState().viewerId })
      const cache = await openProfileCache(profile, { onProblem: (message) => renderer.note(message) })
      try {
        await cache?.clear()
        // The shared store holds this account's rows too; a profile that never logged in has none there.
        const purged = await record.purge()
        const cleared = cache !== undefined || purged
        renderer.result({ profile, cleared })
        if (cleared) renderer.success(`forgot everything cached for "${profile}"`)
        else renderer.note("there is no cache for this profile")
      } finally {
        await cache?.close()
        await record.close()
      }
    })

  return command
}
