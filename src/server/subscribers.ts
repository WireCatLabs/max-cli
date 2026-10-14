import type { Socket } from "node:net"
import { CliError } from "@wirecat/cli-base"
import { toLine } from "./lines.js"

export const SUBSCRIBER_BUFFER_BYTES = 64 * 1024 * 1024
export const SUBSCRIBER_TOTAL_BUFFER_BYTES = 256 * 1024 * 1024

export interface SubscriberBudgets {
  maxSubscriberBufferBytes?: number
  maxSubscriberTotalBufferBytes?: number
}

interface Subscriber {
  socket: Socket
  queue: (string | undefined)[]
  bytes: number
  blocked: boolean
  closed: boolean
  failed: boolean
  head: number
  drain: () => void
  close: () => void
}

/** Each subscriber owns its wait for drain; the shared budget includes writes not yet flushed. */
export class Subscribers {
  readonly #subscribers = new Map<Socket, Subscriber>()
  readonly #perSubscriber: number
  readonly #total: number
  readonly #note: (message: string) => void
  #bytes = 0

  constructor(budgets: SubscriberBudgets = {}, note: (message: string) => void = () => {}) {
    this.#perSubscriber = budget(budgets.maxSubscriberBufferBytes ?? SUBSCRIBER_BUFFER_BYTES)
    this.#total = budget(budgets.maxSubscriberTotalBufferBytes ?? SUBSCRIBER_TOTAL_BUFFER_BYTES)
    this.#note = note
  }

  add(socket: Socket): void {
    if (this.#subscribers.has(socket)) return
    const subscriber: Subscriber = {
      socket,
      queue: [],
      bytes: 0,
      blocked: false,
      closed: false,
      failed: false,
      head: 0,
      drain: () => {
        subscriber.blocked = false
        this.#flush(subscriber)
      },
      close: () => this.delete(socket),
    }
    this.#subscribers.set(socket, subscriber)
    socket.on("drain", subscriber.drain)
    socket.once("close", subscriber.close)
  }

  delete(socket: Socket): void {
    const subscriber = this.#subscribers.get(socket)
    if (!subscriber) return
    subscriber.closed = true
    this.#bytes -= subscriber.bytes
    subscriber.bytes = 0
    subscriber.queue.length = 0
    socket.off("drain", subscriber.drain)
    socket.off("close", subscriber.close)
    this.#subscribers.delete(socket)
  }

  clear(): void {
    for (const socket of this.#subscribers.keys()) {
      this.delete(socket)
      socket.destroy()
    }
  }

  broadcast(line: string): void {
    for (const socket of this.#subscribers.keys()) this.write(socket, line)
  }

  write(socket: Socket, line: string): void {
    const subscriber = this.#subscribers.get(socket)
    if (!subscriber || subscriber.closed || subscriber.failed) return
    const bytes = Buffer.byteLength(line)
    if (this.#perSubscriber > 0 && subscriber.bytes + bytes > this.#perSubscriber) {
      this.#overflow(subscriber)
      return
    }
    if (this.#total > 0 && this.#bytes + bytes > this.#total) {
      // The watcher holding the most is the slow one; cutting off whoever happens to be written next is not.
      const largest = this.#largest()
      if (largest && largest !== subscriber) this.#overflow(largest)
      if (largest === subscriber || this.#bytes + bytes > this.#total) {
        this.#overflow(subscriber)
        return
      }
    }
    subscriber.bytes += bytes
    this.#bytes += bytes
    subscriber.queue.push(line)
    this.#flush(subscriber)
  }

  #flush(subscriber: Subscriber): void {
    while (
      !subscriber.closed &&
      !subscriber.failed &&
      !subscriber.blocked &&
      subscriber.head < subscriber.queue.length
    ) {
      const line = subscriber.queue[subscriber.head]
      subscriber.queue[subscriber.head] = undefined
      subscriber.head += 1
      if (subscriber.head > 1024 && subscriber.head * 2 > subscriber.queue.length) {
        subscriber.queue = subscriber.queue.slice(subscriber.head)
        subscriber.head = 0
      }
      if (line === undefined) break
      const bytes = Buffer.byteLength(line)
      try {
        subscriber.blocked = !subscriber.socket.write(line, (error?: Error | null) => {
          if (subscriber.closed) return
          subscriber.bytes -= bytes
          this.#bytes -= bytes
          if (error) {
            this.delete(subscriber.socket)
            subscriber.socket.destroy()
          }
        })
      } catch {
        this.delete(subscriber.socket)
        subscriber.socket.destroy()
      }
    }
  }

  #largest(): Subscriber | undefined {
    let largest: Subscriber | undefined
    for (const subscriber of this.#subscribers.values())
      if (!subscriber.failed && (!largest || subscriber.bytes > largest.bytes)) largest = subscriber
    return largest
  }

  #overflow(subscriber: Subscriber): void {
    const message = "watch subscription exceeded its output buffer budget; reconnect or increase subscriber limits"
    this.#note(message)
    // Retain accounting for bytes already accepted by the socket until it closes.
    const queued = subscriber.queue
      .slice(subscriber.head)
      .reduce((sum, line) => sum + (line === undefined ? 0 : Buffer.byteLength(line)), 0)
    subscriber.queue.length = 0
    subscriber.bytes -= queued
    this.#bytes -= queued
    subscriber.failed = true
    subscriber.socket.end(toLine({ error: { code: "invalid_response", reason: "output.too-large", message } }))
    const deadline = setTimeout(() => subscriber.socket.destroy(), 1000)
    deadline.unref()
    subscriber.socket.once("close", () => clearTimeout(deadline))
  }
}

const budget = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new CliError("validation_error", "a subscriber buffer budget is a whole number of bytes, 0 for unlimited")
  return value
}
