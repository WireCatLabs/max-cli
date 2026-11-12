import type { Untested } from "./test-matrix-untested.ts"

const test = (file: string) => `cli-core ${file} drives the shared command max mounts unchanged (cli-core 0.647.0)`

/** The commands and options cli-core 0.647.0 brought to max, each driven by cli-core's own tests. */
export const SHARED_0647_UNTESTED: Untested[] = [
  { command: "images read", reason: test("src/cli/messenger/attachments.test.ts") },
  { command: "images read", option: "--attachment", reason: test("src/cli/messenger/attachments.test.ts") },
  { command: "schedule agents list", reason: test("src/cli/schedule/harnesses.test.ts") },
]
