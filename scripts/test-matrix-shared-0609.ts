import type { Untested } from "./test-matrix-untested.ts"

const test = (file: string) => `cli-core ${file} drives the shared command max mounts unchanged (cli-core 0.609.0)`

/** The commands and options cli-core 0.609.0 brought to max, each driven by cli-core's own tests. */
export const SHARED_0609_UNTESTED: Untested[] = [
  { command: "models set", reason: test("src/cli/model-catalogue-command.test.ts") },
  { command: "models add", reason: test("src/cli/model-catalogue-command.test.ts") },
  { command: "models add", option: "--payload", reason: test("src/cli/model-catalogue-command.test.ts") },
]
