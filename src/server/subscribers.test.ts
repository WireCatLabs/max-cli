import { EventEmitter } from "node:events"
import type { Socket } from "node:net"
import { describe, expect, it, vi } from "vitest"
import { Subscribers } from "./subscribers.js"

const subscriber = (blocked = false) => {
  const pending: (() => void)[] = []
  const written: string[] = []
  const emitter = new EventEmitter()
  const socket = Object.assign(emitter, {
    write: vi.fn((line: string, callback: () => void) => {
      written.push(line)
      pending.push(callback)
      return !blocked
    }),
    end: vi.fn((line: string) => {
      written.push(line)
    }),
    destroy: vi.fn(() => emitter.emit("close")),
  })
  return { socket: socket as unknown as Socket, written, pending, emitter, destroy: socket.destroy, end: socket.end }
}

describe("subscriber output queues", () => {
  it("waits for drain in order without blocking another subscriber", () => {
    const slow = subscriber(true)
    const fast = subscriber()
    const subscribers = new Subscribers()
    subscribers.add(slow.socket)
    subscribers.add(fast.socket)
    subscribers.broadcast("first\n")
    subscribers.broadcast("second\n")
    subscribers.broadcast("third\n")
    expect(slow.written).toEqual(["first\n"])
    expect(fast.written).toEqual(["first\n", "second\n", "third\n"])
    slow.pending.shift()?.()
    slow.emitter.emit("drain")
    expect(slow.written).toEqual(["first\n", "second\n"])
    slow.pending.shift()?.()
    slow.emitter.emit("drain")
    expect(slow.written).toEqual(["first\n", "second\n", "third\n"])
    subscribers.clear()
    expect(slow.emitter.listenerCount("drain")).toBe(0)
  })

  it("counts socket writes and queued UTF-8 bytes before rejecting only an overflowing subscription", () => {
    const slow = subscriber(true)
    const fast = subscriber()
    const note = vi.fn()
    const subscribers = new Subscribers({ maxSubscriberBufferBytes: 5 }, note)
    subscribers.add(slow.socket)
    subscribers.add(fast.socket)
    subscribers.broadcast("é\n")
    fast.pending.shift()?.()
    subscribers.broadcast("é\n")
    expect(slow.end).toHaveBeenCalledTimes(1)
    expect(slow.written[1]).toContain('"code":"invalid_response"')
    expect(slow.written[1]).toContain('"reason":"output.too-large"')
    expect(fast.written).toEqual(["é\n", "é\n"])
    expect(note).toHaveBeenCalledTimes(1)
    subscribers.broadcast("ignored\n")
    expect(slow.end).toHaveBeenCalledTimes(1)
    subscribers.clear()
  })

  it("releases the total budget on close and ignores late write callbacks", () => {
    const first = subscriber(true)
    const second = subscriber(true)
    const subscribers = new Subscribers({ maxSubscriberBufferBytes: 0, maxSubscriberTotalBufferBytes: 6 })
    subscribers.add(first.socket)
    subscribers.write(first.socket, "123456")
    first.emitter.emit("close")
    first.pending.shift()?.()
    subscribers.add(second.socket)
    subscribers.write(second.socket, "123456")
    expect(second.end).not.toHaveBeenCalled()
    subscribers.write(second.socket, "7")
    expect(second.end).toHaveBeenCalledTimes(1)
    subscribers.clear()
  })

  it("unlimited byte budgets accept a blocked queue, and close discards it", () => {
    const slow = subscriber(true)
    const subscribers = new Subscribers({ maxSubscriberBufferBytes: 0, maxSubscriberTotalBufferBytes: 0 })
    subscribers.add(slow.socket)
    for (let i = 0; i < 2000; i++) subscribers.write(slow.socket, `${i}\n`)
    expect(slow.end).not.toHaveBeenCalled()
    subscribers.clear()
    slow.pending.shift()?.()
    slow.emitter.emit("drain")
    expect(slow.written).toEqual(["0\n"])
  })

  it("rejects invalid budgets before opening sockets", () => {
    expect(() => new Subscribers({ maxSubscriberBufferBytes: -1 })).toThrow("whole number of bytes")
    expect(() => new Subscribers({ maxSubscriberTotalBufferBytes: 1.2 })).toThrow("whole number of bytes")
  })

  it("a full shared budget disconnects the watcher holding the most, not the one being written", () => {
    const slow = subscriber(true)
    const healthy = subscriber()
    const subscribers = new Subscribers({ maxSubscriberBufferBytes: 0, maxSubscriberTotalBufferBytes: 8 })
    subscribers.add(slow.socket)
    subscribers.add(healthy.socket)
    subscribers.write(slow.socket, "1234")
    subscribers.write(slow.socket, "5678")
    subscribers.write(healthy.socket, "ab")
    expect(slow.end).toHaveBeenCalledTimes(1)
    expect(healthy.end).not.toHaveBeenCalled()
    expect(healthy.written).toEqual(["ab"])
    subscribers.clear()
  })
})
