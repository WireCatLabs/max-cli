import type { Heard } from "../transcribe/index.js"

/** What `--json` adds when `--transcribe` was asked for. */
export const hearingFields = (heard: Heard, transcribe: boolean) =>
  transcribe
    ? { unheard: heard.unheard, ...(heard.problem === undefined ? {} : { transcribeProblem: heard.problem }) }
    : {}
