import { isId, pickChat as pickChatFrom, pickPerson as pickPersonFrom } from "@leemour/cli-messaging"
import type { CacheStore } from "./cache/store.js"
import type { Chat, Contact } from "./domain/models.js"

export { isId }

/** cli-messaging's `pickChat`, typed with max-cli's `Chat`: it answers one of the chats it is given. */
export const pickChat = (reference: string, chats: Chat[]): Chat => pickChatFrom(reference, chats) as Chat

/** cli-messaging's `pickPerson` over the cache, which answers asynchronously. */
export const pickPerson = async (reference: string, cache: CacheStore): Promise<Contact> => {
  const trimmed = reference.trim()
  if (isId(trimmed)) {
    const known = await cache.people.get(trimmed)
    return pickPersonFrom(reference, { get: () => known, all: () => [] })
  }
  const everyone = await cache.people.page({ order: "name", limit: Number.MAX_SAFE_INTEGER, offset: 0 })
  return pickPersonFrom(reference, { get: () => undefined, all: () => everyone })
}
