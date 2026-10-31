/**
 * The second runtime, actually executed against the built command (NEED-11).
 *
 * The Vitest suite covers Node. Bun cannot run it, and a type check proves nothing about a runtime,
 * so this runs the real binary and checks what reached which stream.
 *
 *   pnpm build && bun run scripts/smoke.ts
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openCache } from "@wirecat/cli-core/store"
import { decodeOgg } from "../dist/transcribe/speech.js"

const runtime = typeof (globalThis as { Bun?: unknown }).Bun === "undefined" ? "node" : "bun"
const failures: string[] = []

const check = (what: string, condition: boolean) => {
  if (!condition) failures.push(what)
}

const max = (...args: string[]) => spawnSync(process.execPath, ["dist/bin/max.js", ...args], { encoding: "utf8" })

/**
 * The same command against directories of its own.
 *
 * Every check below writes something, and none of it may land in the owner's real state directory.
 * A moved run still reads the owner's keyring entry, so the keyring is out of reach altogether:
 * `disabled:` and not an unset variable, which falls back to `$XDG_RUNTIME_DIR/bus`.
 */
const isolated = mkdtempSync(join(tmpdir(), "max-smoke-run-"))
const maxHere = (...args: string[]) =>
  spawnSync(process.execPath, ["dist/bin/max.js", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      MAX_PROFILE: "default",
      MAX_CONFIG_DIR: join(isolated, "config"),
      MAX_STATE_DIR: join(isolated, "state"),
      MAX_CACHE_DIR: join(isolated, "cache"),
      DBUS_SESSION_BUS_ADDRESS: "disabled:",
    },
  })

const version = max("--version")
check("--version exits cleanly", version.status === 0)
check("--version prints a version on stdout", /^\d+\.\d+\.\d+$/.test(version.stdout.trim()))
check("--version says nothing on stderr", version.stderr === "")

const skill = max("skill", "show")
check(
  "skill show prints the SKILL.md the package ships",
  skill.status === 0 && skill.stdout.startsWith("---\nname: max-cli"),
)

const help = max("--help")
check("--help names the command", help.stdout.includes("Usage: max"))

const bad = max("--nonsense")
check("an unknown option fails", bad.status !== 0)
check("an unknown option keeps stdout clean", bad.stdout === "")
check("an unknown option explains itself on stderr", bad.stderr.includes("unknown option"))

// Nothing has been recorded, and an empty answer that does not say why reads as broken (NEED-52).
// The explanation is a diagnostic, so stdout still carries one JSON value and nothing else.
const empty = maxHere("runs", "list", "--json")
check("`runs list` exits cleanly with nothing to show", empty.status === 0)
check("`runs list` prints an empty list on stdout", JSON.parse(empty.stdout).items?.length === 0)
check("`runs list` says on stderr why it is empty", empty.stderr.includes("nothing recorded"))

// cli-base's log writer writes the event log, and this is the only place it runs under Bun. A success that logged
// nothing is only a line in the day's index, so the run kept with a folder is a failed `chats list`: offline, in this
// directory, it is refused for want of a session, which proves the run directory, the atomic `run.json` and the log
// stream all work under this runtime.
const recordedRun = maxHere("session", "end", "--record", "--json")
check("a recorded command exits cleanly", recordedRun.status === 0)
check("a recorded command still prints its own answer", JSON.parse(recordedRun.stdout).item?.forgotten === false)
const failedRun = maxHere("chats", "list", "--no-serve", "--json")
check("a command without a session fails", failedRun.status !== 0)

// The runs folder holds cli-core's own marker files beside the days.
const days = readdirSync(join(isolated, "state", "runs")).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
const day = days[0] ?? ""
const kept = readdirSync(join(isolated, "state", "runs", day), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.includes("-chats-list-"))
  .map((entry) => entry.name)
const runDir = join(isolated, "state", "runs", day, kept[0] ?? "")
check("the failed command left one run directory", days.length === 1 && kept.length === 1)
check("the run directory holds its metadata", existsSync(join(runDir, "run.json")))
check("the run directory holds its event log", existsSync(join(runDir, "events.jsonl")))

type Listed = { run_id?: string; command?: string; status?: string }
const listed = (JSON.parse(maxHere("runs", "list", "--json").stdout).items ?? []) as Listed[]
check(
  "`runs list` finds the success kept as an index line",
  listed.some((run) => run.command === "session end" && run.status === "success"),
)
check(
  "`runs list` finds the failure kept with its folder",
  listed.some((run) => run.run_id === kept[0] && run.status === "failed"),
)

const path = maxHere("runs", "path", kept[0] ?? "", "--json")
check("`runs path` answers with the directory, as one JSON value", JSON.parse(path.stdout).item?.path === runDir)

const shown = maxHere("runs", "show", kept[0] ?? "", "--json")
check("`runs show` answers with the run and its events", JSON.parse(shown.stdout).item?.run_id === kept[0])
check("`runs show` refuses an id it does not have", maxHere("runs", "show", "no-such-run").status !== 0)

const database = await openCache(join(isolated, "smoke.db"))
try {
  check("shared SQLite opens under this runtime", true)
  check(
    "it is in write-ahead mode",
    (database.prepare("PRAGMA journal_mode").get() as { journal_mode?: string })?.journal_mode === "wal",
  )

  database.exec("CREATE TABLE t (a TEXT PRIMARY KEY, b INTEGER)")
  check(
    "a write reports how many rows it changed",
    database.prepare("INSERT INTO t VALUES (?, ?)").run("x", 1).changes === 1,
  )
  check(
    "a read gives the value back",
    (database.prepare("SELECT b FROM t WHERE a = ?").get("x") as { b?: number })?.b === 1,
  )
  check(
    "a conflicting write changes nothing",
    database.prepare("INSERT INTO t VALUES (?, ?) ON CONFLICT(a) DO NOTHING").run("x", 2).changes === 0,
  )
} finally {
  database.close()
}

// Transcription is WebAssembly on purpose — a native module is what usually breaks under Bun — and
// this is where that choice is proven. The model itself is too large for CI; the engine and the
// decoder are not.
const decoded = await decodeOgg(new Uint8Array(readFileSync("src/testing/fixtures/tone.ogg")))
check("a voice recording decodes under this runtime", decoded.rate === 48_000 && decoded.samples.length > 40_000)
const sherpa = createRequire(import.meta.url)("sherpa-onnx") as { createOfflineRecognizer?: unknown }
check("the speech engine loads under this runtime", typeof sherpa.createOfflineRecognizer === "function")

// The published bin is a loader for dist/bundle/ (cli-dev bundle, WC-LAY-10): these load from the bundle.
const loader = readFileSync("dist/bin/max.js", "utf8")
check("the bin starts the bundle", loader.includes('import("../bundle/max.js")'))
const preloaded = [...loader.matchAll(/"\.\.\/bundle\/([^"]+)"/g)].map(([, chunk]) => chunk ?? "")
check(
  "a server preloads only chunks the bundle has",
  preloaded.length > 1 && preloaded.every((chunk) => existsSync(join("dist/bundle", chunk))),
)
const recorded = spawnSync(process.execPath, ["dist/bin/max.js", "--version"], {
  encoding: "utf8",
  env: { ...process.env, MAX_TEST_ARGV_LOG: join(isolated, "argv.jsonl") },
})
check("the loader's --version is the bundle's", recorded.stdout === version.stdout)
check("skill show finds cli-core's skills from the bundle", max("skill", "show", "follow-ups").stdout.startsWith("---"))
// A profile takes a read as far as the store: its SQLite loads from cli-core's own dependencies.
maxHere("smoke", "config", "set", "limit", "20")
check(
  "the store opens and has nothing recorded",
  maxHere("smoke", "chats", "list", "--offline", "--json").stderr.includes('"reason":"item.not-found"'),
)
check(
  "doctor finds the document readers",
  maxHere("smoke", "doctor", "--json").stdout.includes('"files":{"checked":true,"ok":true'),
)

rmSync(isolated, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`max-cli smoke FAILED under ${runtime}:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`max-cli smoke passed under ${runtime}`)
