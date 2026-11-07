import type { Untested } from "./test-matrix-untested.ts"

const test = (file: string) => `cli-core ${file} drives the shared command max mounts unchanged (cli-core 0.599.0)`

/** The commands and options cli-core 0.599.0 brought to max, each driven by cli-core's own tests. */
export const SHARED_0599_UNTESTED: Untested[] = [
  { command: "store recover", reason: test("src/cli/store-recover.test.ts") },
  { command: "store recover run", reason: test("src/cli/store-recover.test.ts") },
  ...["--notify-on", "--deliver-to"].map((option) => ({
    command: "schedule command",
    option,
    reason: test("src/cli/messenger/schedule.test.ts"),
  })),
]
