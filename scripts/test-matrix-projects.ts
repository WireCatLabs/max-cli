import type { Untested } from "./test-matrix-untested.ts"

const STATUS_TEST = `src/cli/messenger/projects-command.test.ts ("answers from the store alone, for this profile's account, and syncs the chat it holds in part first")`

export const PROJECTS_UNTESTED: Untested[] = [
  ...[undefined, "--since-time", "--before-time", "--context-query"].map((option) => ({
    command: "projects status",
    ...(option ? { option } : {}),
    reason: `cli-core ${STATUS_TEST} drives the shared command MAX mounts, over the store (0.551.0)`,
  })),
  {
    command: "projects status",
    option: "--purpose",
    reason: `cli-core src/services/project-status/project-status.test.ts ("reads only the default purposes, and leaves every chat out when none of them is asked") covers the shared status MAX mounts (0.553.0)`,
  },
  {
    command: "projects evidence",
    option: "--purpose",
    reason: `cli-core src/cli/messenger/projects-command.test.ts ("reads every linked chat with --purpose all, and the asked one with --purpose sales") drives the shared command MAX mounts (0.553.0)`,
  },
  {
    command: "projects evidence",
    option: "--include-proposed",
    reason: `cli-core src/cli/messenger/projects-command.test.ts ("reads a proposed chat only with --include-proposed, and marks every item it alone brought") drives the shared command MAX mounts (0.553.0)`,
  },
]
