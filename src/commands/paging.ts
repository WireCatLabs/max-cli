import { CliError, type Renderer, type RenderFormat } from "@wirecat/cli-base"
import { jsonlRecords } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import type { Settings } from "../config.js"
import { type ListPage, listAnswer } from "../envelope.js"

/** Checked while parsing, so the error can quote what was typed rather than the `NaN` it became. */
export const wholeNumber =
  (flag: string) =>
  (value: string): number => {
    if (!/^\d+$/.test(value.trim()) || Number(value) < 1) {
      throw new CliError("validation_error", `${flag} takes a whole number from 1 upwards, not "${value}"`)
    }
    return Number(value)
  }

/**
 * The three flags every listing shares, so no command invents its own spelling of them.
 *
 * ⚠ **None of them gets a `default`.** With one, commander reports the flag as always given and a
 * configured `limit` could never win it; the number lives once, in `resolveSettings`.
 */
export const withPaging = (command: Command): Command =>
  command
    .option("--limit <n>", "how many to show", wholeNumber("--limit"))
    .option("--page <n>", "which page, starting at 1", wholeNumber("--page"))
    .option("--all", "every row, no paging")

/**
 * Which rows to ask the store for. `--all` means no limit, which the store reads as "everything".
 *
 * ⚠ **A page number over a live list can repeat or skip a row.** The order is most-recent-first,
 * so a message arriving between page one and page two pushes somebody across the boundary. Every
 * CLI that pages this way has this; it is in `--help` rather than engineered away.
 */
export const window = ({ limit, page, all }: Settings): { limit?: number; offset: number } =>
  all ? { offset: 0 } : { limit, offset: (page - 1) * limit }

/** A list in the envelope; `--jsonl` streams the items and the end line, and a person gets the table. */
export const renderList = (
  renderer: Renderer,
  format: RenderFormat,
  items: readonly unknown[],
  page: ListPage,
): void => {
  if (format === "json") renderer.result(listAnswer(items, page))
  else if (format === "jsonl") renderer.stream(jsonlRecords(listAnswer(items, page)))
  else renderer.stream(items)
}
