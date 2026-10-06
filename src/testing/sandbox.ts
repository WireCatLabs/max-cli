import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"
import { ARGV_LOG } from "./argv-log.js"

/**
 * **Moves the whole installation into a temporary directory, for every test file.**
 *
 * A test that drives a command reads the real configuration file and opens the real cache — and
 * opening the cache migrates it, which on a schema change means rebuilding it and throwing away
 * what the owner had. That is not a hypothetical: on 2026-09-22 a test run did exactly that to a
 * real machine, and the only reason it was noticed was a timestamp.
 *
 * It is a setup file rather than a hook in one test because the hazard belongs to any test that
 * reaches a command, not to the file that happened to find it. **`pnpm test` must not be able to
 * write anything a person owns**, and that has to be true of the next test file as well as this
 * one.
 *
 * The three variables move config, state and cache together; `MESSAGING_STORE` moves the shared
 * message store, which lives in cli-messaging's own directory. They also scope the keyring entry
 * (`ARCHITECTURE.md` §14) — the documented trap, which here is precisely the isolation wanted.
 *
 * `TMPDIR` points into it too, and the whole of it goes when the file is done: every test makes
 * its directories with `mkdtempSync(join(tmpdir(), …))`, and by 2026-09-23 that had left some
 * fifteen thousand of them in `/tmp` (`DEBT-3`). `os.tmpdir()` reads `TMPDIR` on every call.
 */
// macOS's own temporary directory is long enough to push a socket path past its 104 bytes.
const sandbox = mkdtempSync(join(process.platform === "darwin" ? "/tmp" : tmpdir(), "max-test-"))

process.env.MAX_CONFIG_DIR = join(sandbox, "config")
process.env.MAX_STATE_DIR = join(sandbox, "state")
process.env.MAX_CACHE_DIR = join(sandbox, "cache")
// cli-messaging's store is one file for every messenger, outside all three.
process.env.MESSAGING_STORE = join(sandbox, "messages.db")
// Speech models shared by every CLI, also outside the three. A test that writes a sized stand-in for
// a model there overwrote the owner's downloaded one on 2026-10-01.
process.env.CLI_COMMON_CACHE_DIR = join(sandbox, "common-cache")
// `max server install` writes the systemd unit under it — the owner's real one otherwise.
process.env.XDG_CONFIG_HOME = join(sandbox, "xdg-config")
process.env.TMPDIR = sandbox
// Read before the keyring, so a token exported in the shell would log the suite in to the real account.
delete process.env.MAX_TOKEN
delete process.env.MAX_PROFILE_LOCK
process.env.MAX_TEST_SANDBOX = "1"
process.env.MAX_TEST_ARGV_LOG = ARGV_LOG
for (const key of Object.keys(process.env)) {
  if (/^MAX_(MODELS|EMBEDDING|ANALYSIS)_/.test(key)) delete process.env[key]
}
// A terminal running the suite must not make it ask npm; the tests that want the check pass their own env.
process.env.MAX_NO_UPDATE_CHECK = "1"
// An agent running the suite would get the skill hint on stderr in whichever test came first.
delete process.env.AI_AGENT
delete process.env.CLAUDECODE

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))
