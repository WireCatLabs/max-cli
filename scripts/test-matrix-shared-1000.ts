import { SHARED_0664_0706_UNTESTED } from "./test-matrix-shared-0706.ts"
import type { Untested } from "./test-matrix-untested.ts"

/**
 * The options cli-core 1.0 added to shared commands max mounts unchanged, after cli-core 0.706.0's:
 * test-matrix-untested.ts is at biome's line limit, so they share its one import.
 */
export const SHARED_0664_0706_1000_UNTESTED: Untested[] = [
  ...SHARED_0664_0706_UNTESTED,
  {
    command: "store migrate",
    option: "--no-backup",
    reason:
      "cli-core src/cli/messenger/store-maintenance.test.ts covers store migrate; consumer mounts the shared command",
  },
  {
    command: "search conversations",
    option: "--like",
    reason:
      "phase 5's shared command; it runs a text model — downloaded over the network, or an external one with its own key — so max's offline tests cannot; cli-core's src/services/embeddings.test.ts drives it with a stand-in model",
  },
]
