import { SHARED_0664_UNTESTED } from "./test-matrix-shared-0664.ts"
import type { Untested } from "./test-matrix-untested.ts"

const reason =
  'MAX has no scheduled-message actions, so cli-core refuses them with "this messenger cannot …"; ' +
  "cli-core src/cli/messenger/messages-scheduled.test.ts drives the shared command and its refusal (cli-core 0.706.0)"

/**
 * The scheduled-message actions cli-core 0.706.0 brought to max, which MAX cannot carry out yet, after cli-core
 * 0.664.0's: test-matrix-untested.ts is at biome's line limit, so the two share its one import.
 */
export const SHARED_0664_0706_UNTESTED: Untested[] = [
  ...SHARED_0664_UNTESTED,
  { command: "messages scheduled cancel", reason },
  { command: "messages scheduled cancel", option: "--allow-dangerous", reason },
  { command: "messages scheduled edit", reason },
  { command: "messages scheduled edit", option: "--at-time", reason },
  { command: "messages scheduled edit", option: "--md", reason },
  { command: "messages scheduled send", reason },
]
