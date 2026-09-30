import { describe, expect, it } from "vitest"
import type { CacheStore } from "./cache/store.js"
import type { Chat, Contact } from "./domain/models.js"
import { pickChat, pickPerson } from "./resolve.js"

const chat = (id: string, title: string): Chat => ({
  id,
  title,
  kind: "group",
  unreadCount: 0,
  lastMessageAt: null,
  participantsCount: 2,
})

describe("a chat named by its title", () => {
  it("resolves a full exact title when no other title contains it", () => {
    expect(pickChat("мама", [chat("1", "Мама"), chat("2", "Папа")]).id).toBe("1")
  })

  it("asks which one when an exact title is also part of another title", () => {
    expect(() => pickChat("Мама", [chat("1", "Мама"), chat("2", "Мама Иванова")])).toThrow(/matches 2 chats/)
  })

  it("lists each candidate on one line, so a title cannot add a row of its own", () => {
    const forged = "Работа\n  999  Работа (настоящая)"
    let message = ""
    try {
      pickChat("Работа", [chat("1", "Работа отдел"), chat("2", forged)])
    } catch (error) {
      message = (error as Error).message
    }
    expect(message.split("\n")).toHaveLength(3)
    expect(message).toContain("Работа\\x0a  999")
  })
})

const person = (id: string, name: string): Contact => ({
  id,
  name,
  username: null,
  description: null,
  lastMessagedAt: null,
})

const knowing = (people: Contact[]) =>
  ({
    people: {
      get: async (id: string) => people.find((one) => one.id === id),
      page: async () => people,
    },
  }) as unknown as CacheStore

describe("a person named by name", () => {
  it("takes an exact name over names that contain it", async () => {
    const cache = knowing([person("1", "Ольга"), person("2", "Ольга Петрова")])
    expect((await pickPerson("ольга", cache)).id).toBe("1")
  })

  it("asks which one when a fragment matches two, and finds nobody by an unknown id", async () => {
    const cache = knowing([person("1", "Ольга Иванова"), person("2", "Ольга Петрова")])
    await expect(pickPerson("Ольга", cache)).rejects.toThrow(/matches 2 people/)
    await expect(pickPerson("3", cache)).rejects.toThrow(/no person 3/)
  })
})
