import type { ModeProblem } from "@wirecat/cli-core/cli"

/** Whether others can read the config file or enter its folder, as `doctor` answers it. */
export type DoctorFiles =
  | { checked: false; reason: string }
  | { checked: true; ok: boolean; problems: Omit<ModeProblem, "fix">[] }
