import { describe, expect, it } from "vitest"
import { operations, reservations, spec } from "../spec/index.js"
import { Opcode } from "./opcodes.generated.js"
import { OPERATIONS } from "./operations.generated.js"

describe("what the generator wrote", () => {
  it("holds every opcode the specification declares, sent or not", () => {
    for (const entry of spec) {
      expect(Opcode[entry.constant as keyof typeof Opcode], entry.name).toBe(entry.opcode)
    }
    expect(Object.keys(Opcode)).toHaveLength(spec.length)
  })

  it("**gives a method only to what may be sent**", () => {
    expect(Object.keys(OPERATIONS)).toHaveLength(operations.length)
    for (const reservation of reservations) {
      expect(Object.keys(OPERATIONS)).not.toContain(reservation.name)
    }
  })
})
