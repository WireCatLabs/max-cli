import type { Chat } from "@wirecat/cli-core"
import { isId, pickChat as pickChatFrom } from "@wirecat/cli-core"

export { isId }

/** cli-core's `pickChat`, typed with max-cli's `Chat`: it answers one of the chats it is given. */
export const pickChat = (reference: string, chats: Chat[]): Chat => pickChatFrom(reference, chats) as Chat
