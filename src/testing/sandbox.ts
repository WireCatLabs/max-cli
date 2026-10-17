import { tmpdir } from "node:os"
import { join } from "node:path"
import { ARGV_LOG } from "./argv-log.js"

/**
 * **max's own part of the sandbox, after cli-base's `testing/setup`**, which already gives each test
 * file a fresh TMPDIR, HOME and XDG folders, removed when the file is done, a keyring that throws and
 * no network.
 *
 * A test that drives a command reads the real configuration file and opens the real cache — and
 * opening the cache migrates it, which on a schema change means rebuilding it and throwing away
 * what the owner had. That is not a hypothetical: on 2026-09-22 a test run did exactly that to a
 * real machine. **`pnpm test` must not be able to write anything a person owns.**
 *
 * The three variables move config, state and cache together, and tests read them; `MESSAGING_STORE`
 * moves the shared message store, which lives in cli-core's own directory. They also scope the keyring
 * entry (`ARCHITECTURE.md` §14) — the documented trap, which here is precisely the isolation wanted.
 */
const sandbox = tmpdir()

process.env.MAX_CONFIG_DIR = join(sandbox, "config")
process.env.MAX_STATE_DIR = join(sandbox, "state")
// One profile's pace file is shared by every test: paced, a file of tests would wait on each other's calls.
process.env.MAX_REQUESTS_PER_MINUTE = "0"
process.env.MAX_CACHE_DIR = join(sandbox, "cache")
// cli-core's store is one file for every messenger, outside all three.
process.env.MESSAGING_STORE = join(sandbox, "messages.db")
// The WireCat folder every CLI shares, also outside the three: speech models, and the store when
// MESSAGING_STORE is unset. A test that wrote a sized stand-in for a model there overwrote the owner's
// downloaded one on 2026-10-01.
process.env.WIRECAT_STATE_DIR = join(sandbox, "wirecat")
// Read before the keyring, so a token exported in the shell would log the suite in to the real account.
delete process.env.MAX_TOKEN
delete process.env.MAX_PROFILE_LOCK
// No profile is ever assumed; a test about "none named" removes this from its own env.
process.env.MAX_PROFILE = "default"
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

// Unit tests use scripted adapters; request pacing must never introduce a real wait.
process.env.MAX_REQUESTS_PER_MINUTE = "0"
