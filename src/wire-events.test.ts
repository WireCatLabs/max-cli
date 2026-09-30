import { describe, expect, it } from "vitest"
import { countsIn, idsOf } from "./wire-events.js"

describe("what an event may carry", () => {
  it("**takes the ids a request named and nothing else from it**", () => {
    expect(idsOf({ chatId: "0", from: 1789776000000, backward: 20, itemType: "REGULAR" })).toEqual({
      ids: { chat: "0" },
    })
  })

  it("**cannot reach a token, because no branch here looks for one**", () => {
    const login = { token: "a-real-looking-token", interactive: false, chatsCount: 40, chatsSync: 0 }
    expect(JSON.stringify(idsOf(login))).not.toContain("a-real-looking-token")
    expect(idsOf(login)).toEqual({})
  })

  it("leaves the message behind and keeps the `cid` that makes a send repeatable, as its send id", () => {
    const send = { chatId: "0", message: { text: "something private", cid: 4242, elements: [] }, notify: true }
    const picked = idsOf(send)

    expect(picked).toEqual({ ids: { chat: "0", send: "4242" } })
    expect(JSON.stringify(picked)).not.toContain("something private")
  })

  it("counts the people a lookup asked about rather than naming them", () => {
    expect(idsOf({ contactIds: ["10000003", "10000004"] })).toEqual({ counts: { contacts: 2 } })
  })

  it("counts every list in an answer, and takes nothing out of one", () => {
    const answer = {
      chats: [{ title: "Family" }, { title: "Work" }],
      contacts: [{ name: "Ivan Petrov" }],
      profile: { name: "Ivan Petrov" },
    }

    const counts = countsIn(answer)
    expect(counts).toEqual({ chats: 2, contacts: 1 })
    expect(JSON.stringify(counts)).not.toContain("Ivan")
  })

  it("says nothing about an answer that has no lists", () => {
    expect(countsIn({ profile: {} })).toBeUndefined()
  })
})
