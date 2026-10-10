/**
 * Gives a worktree the owner's sessions by copying them from the installed `max` (`OPS-18`).
 *
 *   node --experimental-strip-types scripts/seed-worktree.ts           # once; bin/max runs it
 *   node --experimental-strip-types scripts/seed-worktree.ts --force   # again, after a new login
 *
 * `bin/max` points a worktree at its own `.max/` so a branch's build never migrates the owner's
 * cache. That also moves the keyring entry (`pathsAreOverridden` in cli-core), and a `session start`
 * per worktree is a new device login on the real account — every release, for every profile.
 * Copying keeps the device and the token; the cache is never copied, so the isolation holds.
 *
 * Tokens go keyring to keyring inside this process: never printed, never in argv or a child's env.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { type KeyringStore, keyringService, resolvePaths, systemKeyring } from "@wirecat/cli-core"

const SERVICE = "max-cli"

/** Live processes and per-run records belong to the installation that made them. */
const skipped = (relative: string): boolean => {
  const name = basename(relative)
  return (
    relative === "runs" ||
    relative === "update-check.json" ||
    name.includes(".sock") ||
    name.endsWith(".serve.log") ||
    name.endsWith(".lock")
  )
}

const copyTree = (from: string, to: string, relative = ""): void => {
  const source = join(from, relative)
  const mode = statSync(source).mode & 0o777
  mkdirSync(join(to, relative), { recursive: true, mode })
  chmodSync(join(to, relative), mode)
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const path = join(relative, entry.name)
    if (skipped(path)) continue
    if (entry.isDirectory()) copyTree(from, to, path)
    else if (entry.isFile()) {
      copyFileSync(join(from, path), join(to, path))
      chmodSync(join(to, path), statSync(join(from, path)).mode & 0o777)
    }
  }
}

/** A profile or bot is named by its state file: `profiles/<name>.json`, `bots/<name>.json`. */
const names = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((file) => /^[^.]+\.json$/.test(file))
        .map((file) => file.slice(0, -".json".length))
    : []

export interface SeedOptions {
  installed: { config: string; state: string }
  target: { config: string; state: string }
  keyring: KeyringStore
  force?: boolean
}

export interface Seeded {
  copied: boolean
  reason?: string
  profiles: string[]
  bots: string[]
}

export const seed = ({ installed, target, keyring, force = false }: SeedOptions): Seeded => {
  if (existsSync(target.state) && !force) return { copied: false, reason: "already seeded", profiles: [], bots: [] }
  if (!existsSync(installed.state)) {
    return { copied: false, reason: "no installed max on this machine", profiles: [], bots: [] }
  }

  copyTree(installed.state, target.state)
  const config = join(installed.config, "config.json")
  if (existsSync(config)) {
    mkdirSync(target.config, { recursive: true, mode: 0o700 })
    copyFileSync(config, join(target.config, "config.json"))
    chmodSync(join(target.config, "config.json"), statSync(config).mode & 0o777)
  }

  const into = keyringService(SERVICE, target.config, true)
  const moved = (account: string): boolean => {
    const token = keyring.get(SERVICE, account)
    if (token === null) return false
    keyring.set(into, account, token)
    return true
  }
  return {
    copied: true,
    profiles: names(join(installed.state, "profiles")).filter((name) => moved(name)),
    bots: names(join(installed.state, "bots")).filter((name) => moved(`bot:${name}`)),
  }
}

const describe = ({ copied, reason, profiles, bots }: Seeded): string =>
  copied
    ? `copied the installed max's sessions into .max/ — profiles: ${profiles.join(", ") || "none"}; bots: ${bots.join(", ") || "none"}`
    : `no sessions copied: ${reason}${reason === "already seeded" ? " (--force copies again)" : " — use bin/max session start"}`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^MAX_.*_DIR$/.test(name)))
  const paths = resolvePaths({ appName: SERVICE, prefix: "MAX", env })
  const result = seed({
    installed: { config: paths.config, state: paths.state },
    target: { config: join(root, ".max/config"), state: join(root, ".max/state") },
    keyring: systemKeyring,
    force: process.argv.includes("--force"),
  })
  process.stderr.write(`${describe(result)}\n`)
}
