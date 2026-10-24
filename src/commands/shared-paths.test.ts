import { describe, expect, it } from "vitest"
import { chatsCommand } from "./chats.js"
import { contactsCommand } from "./contacts.js"

describe("canonical shared command mounts", () => {
  it("mounts the shared contact and invitation paths by their canonical names", () => {
    const contacts = contactsCommand()
    const chats = chatsCommand()
    const names = contacts.commands.map((command) => command.name())
    expect(names).toEqual(expect.arrayContaining(["info", "aliases", "events", "prepare"]))
    for (const retired of ["profile", "alias", "timeline"]) expect(names).not.toContain(retired)
    expect(chats.commands.map((command) => command.name())).toContain("links")
    expect(chats.commands.map((command) => command.name())).not.toContain("link")
    for (const command of [...contacts.commands, ...chats.commands]) expect(command.aliases()).toEqual([])
  })
})
