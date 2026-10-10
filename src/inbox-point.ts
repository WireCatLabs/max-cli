import { existsSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths, writeSecurely } from "@wirecat/cli-core"
import type { Command } from "commander"
import { forCommand } from "./commands/context.js"

export const migrateInboxPoint = (command: Command): void => {
  if (command.optsWithGlobals<{ offline?: boolean }>().offline) return
  const { store, settings } = forCommand(command)
  const point = join(resolvePaths({ appName: "max-cli", prefix: "MAX" }).state, "inbox", `${settings.profile}.json`)
  if (existsSync(point)) return
  const lastCheckAt = store.readState().lastCheckAt
  if (lastCheckAt === undefined) return
  writeSecurely(point, `${JSON.stringify({ lastCheckAt })}\n`, 0o600)
}
