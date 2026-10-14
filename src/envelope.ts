import type { Renderer, RenderFormat } from "@wirecat/cli-base"
import { currentRun } from "@wirecat/cli-core/cli"

/** cli-core builds its own answers with helpers it does not export; max's own commands and tools answer the same shape. */
const meta = () => {
  const run = currentRun()
  return { run_id: run.runId, duration_ms: Math.max(0, Math.round(Date.now() - (run.startedAt ?? Date.now()))) }
}

export const itemAnswer = <T>(item: T) => ({ item, meta: meta() })

export const listAnswer = <T>(items: readonly T[], page: { limit: number; has_more: boolean; cursor?: string }) => ({
  items,
  page,
  meta: meta(),
})

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

/** Only for records whose keys are field names, never for one keyed by data. */
export const snakeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snakeKeys)
  if (value === null || typeof value !== "object" || value.constructor !== Object) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, inner]) => (inner === undefined ? [] : [[snake(key), snakeKeys(inner)]])),
  )
}

/** `--json` gets the envelope, `--jsonl` the item as one line, a person the item alone. */
export const renderItem = (renderer: Renderer, format: RenderFormat, item: unknown): void => {
  if (format === "json") renderer.result(itemAnswer(item))
  else if (format === "jsonl") renderer.stream([item])
  else renderer.result(item)
}
