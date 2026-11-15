import type { Untested } from "./test-matrix-untested.ts"

const test = (file: string) => `cli-core ${file} drives the shared command max mounts unchanged (cli-core 0.664.0)`

/** The commands and options cli-core 0.664.0 brought to max, each driven by cli-core's own tests. */
export const SHARED_0664_UNTESTED: Untested[] = [
  { command: "models chats show", reason: test("src/cli/messenger/models-command.test.ts") },
  { command: "models chats set", reason: test("src/cli/messenger/models-command.test.ts") },
  { command: "models chats set", option: "--from-app", reason: test("src/cli/messenger/models-command.test.ts") },
  { command: "conversations links rebuild", option: "--yes", reason: test("src/cli/messenger/analysis.test.ts") },
]
