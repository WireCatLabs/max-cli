import { describe, expect, it } from "vitest"
import { fromLine, toLine } from "./lines.js"

describe("a line on max serve's socket", () => {
  it("**carries bytes as bytes** — a voice message's waveform sent through the server", () => {
    const wave = new Uint8Array([0, 64, 127])

    const back = fromLine(toLine({ payload: { attaches: [{ _type: "AUDIO", wave }] } }))

    const [attach] = (back.payload as { attaches: { wave: unknown }[] }).attaches
    expect(attach?.wave).toBeInstanceOf(Uint8Array)
    expect(Array.from(attach?.wave as Uint8Array)).toEqual([0, 64, 127])
  })

  it("keeps an 18-digit id a bigint, and a count a number", () => {
    const back = fromLine(toLine({ messageId: 116762160362694583n, count: 3 }))

    expect(back).toEqual({ messageId: 116762160362694583n, count: 3 })
  })
})
