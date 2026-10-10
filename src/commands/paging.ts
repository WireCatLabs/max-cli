import { CliError, type Renderer, type RenderFormat, type Streams } from "@wirecat/cli-core"
import type { Command } from "commander"
import type { Settings } from "../config.js"
import type { Page } from "../domain/models.js"

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

/**
 * A list with no pages — folders, members, runs, everything a bot lists — in the envelope a paged
 * one uses (`NEED-358`), so an agent reads one shape. `--jsonl` streams it and a person gets the table.
 * `extra` goes beside it: a Bot API list paged by `marker` carries its marker and `hasMore`.
 */
export const renderList = (
  renderer: Renderer,
  format: RenderFormat,
  items: readonly unknown[],
  extra: { hasMore?: boolean } & Record<string, unknown> = {},
): void => {
  if (format === "json") renderer.result({ ...listed(items), ...extra })
  else renderer.stream(items)
}

export const listed = (items: readonly unknown[]) => ({ items, page: 1, limit: items.length, hasMore: false })

/**
 * **One shape for every listing**, and the caller never has to work out which one it got.
 *
 * In the machine modes stdout carries the envelope. For a person it carries the table it always
 * did, and the line about there being another page goes to **stderr** as a note — stdout is data
 * in every mode, and a pager's hint is not data.
 *
 * It is a helper each command calls rather than something inside `renderer.result`, because
 * `account show` and `session start` are not lists and keep answering a bare object.
 */
export const renderPage = <T>(
  {
    renderer,
    format,
    settings,
    streams,
  }: { renderer: Renderer; format: RenderFormat; settings: Settings; streams: Streams },
  { items, hasMore }: Page<T>,
  view?: (items: T[]) => string,
  /** What to type for the rest, when the listing is not paged by `--page`. */
  more?: (items: T[]) => string,
  /** Fields beside the page in `--json`. */
  extra: object = {},
): void => {
  if (format === "jsonl") {
    renderer.stream(items)
    if (!settings.all && hasMore)
      renderer.note(more ? more(items) : `more — \`--page ${settings.page + 1}\` for the next`)
    return
  }

  if (format !== "pretty") {
    renderer.result({
      items,
      page: settings.all ? 1 : settings.page,
      limit: settings.all ? items.length : settings.limit,
      hasMore: settings.all ? false : hasMore,
      ...extra,
    })
    return
  }

  if (view) streams.data(view(items))
  else renderer.result(items)
  if (!settings.all && hasMore)
    renderer.note(more ? more(items) : `page ${settings.page} of more — \`--page ${settings.page + 1}\` for the next`)
}
