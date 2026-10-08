import { afterEach, expect, it, vi } from "vitest"
import { serveStems } from "./serve-stems.js"

afterEach(() => vi.useRealTimers())

it("fills stems beside serve and leaves no timer or open store after stop", async () => {
  vi.useFakeTimers()
  const notes: string[] = []
  const stems = serveStems({ note: (line) => notes.push(line) })
  stems.start()
  await vi.advanceTimersByTimeAsync(31_000)
  await stems.stop()
  expect(vi.getTimerCount()).toBe(0)
  expect(notes).toEqual([])
})
