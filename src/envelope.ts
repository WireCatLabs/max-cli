import type { Renderer, RenderFormat } from "@wirecat/cli-base"
import { itemOf, jsonlRecords, metaNow, sealed } from "@wirecat/cli-core/cli"

export { snakeKeys } from "@wirecat/cli-core/cli"

export interface ListPage {
  limit: number
  has_more: boolean
  /** Where the next page starts, for a source that pages by its own position. */
  cursor?: string
}

export const itemAnswer = <T>(item: T) => sealed(itemOf(item))

export const listAnswer = <T>(items: readonly T[], { limit, has_more, cursor }: ListPage) => ({
  items: [...items],
  page:
    cursor === undefined
      ? { mode: "page" as const, limit, has_more }
      : { mode: "cursor" as const, limit, has_more, next_cursor: cursor },
  meta: metaNow(),
})

/** `--json` gets the envelope, `--jsonl` the item and the end line, a person the item alone. */
export const renderItem = (renderer: Renderer, format: RenderFormat, item: unknown): void => {
  if (format === "json") renderer.result(itemAnswer(item))
  else if (format === "jsonl") renderer.stream(jsonlRecords(itemOf(item)))
  else renderer.result(item)
}
