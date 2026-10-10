import type { IdMaker, Seed } from "@wirecat/cli-messaging/testing"
import { Opcode } from "../generated/opcodes.generated.js"
import type { Payload } from "../protocol/frame.js"
import { type MockMax, mockMax } from "./mock-max.js"

/** MAX's ids: people and chats are small numbers, a message id is its send time shifted left 16 bits plus a counter. */
export const maxIds: IdMaker = (kind, n, time) =>
  kind === "message"
    ? String((BigInt(time.getTime()) << 16n) + BigInt(n))
    : String({ person: 10000000, chat: 200 }[kind] + n)

/**
 * MAX holding the contract seed: the login carries its chats, members and people, history pages
 * over its messages, and a send joins the chat's history. **A repeated `cid` answers the message it
 * first made and adds no copy** — measured against MAX (docs/dev/ARCHITECTURE.md §6).
 */
export const seededMax = (seed: Seed): MockMax => {
  const people = new Map([...(seed.account ? [seed.account] : []), ...seed.people].map((one) => [one.id, one]))
  const contact = (id: string) => ({ id: Number(id), names: [{ name: people.get(id)?.name ?? id, type: "ONEME" }] })
  const raw = (message: Seed["messages"][number]) => ({
    id: BigInt(message.id),
    time: Date.parse(message.timestamp),
    sender: Number(message.senderId),
    text: message.text,
    attaches: [],
  })
  const history = new Map<string, ReturnType<typeof raw>[]>(seed.chats.map((chat) => [chat.id, []]))
  for (const message of seed.messages) history.get(message.chatId)?.push(raw(message))
  const sent = new Map<number, ReturnType<typeof raw>>()

  const chats = seed.chats.map((chat) => ({
    id: Number(chat.id),
    type: chat.kind === "dialog" ? "DIALOG" : "CHAT",
    title: chat.kind === "dialog" ? null : chat.title,
    lastEventTime: Date.parse(chat.lastMessageAt ?? ""),
    newMessages: chat.unreadCount,
    participantsCount: chat.participantsCount,
    participants: Object.fromEntries((seed.members[chat.id] ?? []).map((member) => [member.id, 0])),
  }))

  const window = ({ chatId, from, backward, forward }: Payload) => {
    const all = history.get(String(chatId)) ?? []
    const at = Number(from)
    const older = Number(backward) > 0 ? all.filter((one) => one.time <= at).slice(-Number(backward)) : []
    const newer = all.filter((one) => (Number(backward) > 0 ? one.time > at : one.time >= at)).slice(0, Number(forward))
    return { messages: [...older, ...newer] }
  }

  const send = ({ chatId, message }: Payload) => {
    const { cid, text } = message as { cid: number; text: string }
    const known = sent.get(cid)
    if (known) return { message: known }
    const time = Date.now()
    const made = {
      id: (BigInt(time) << 16n) + BigInt(sent.size + 1),
      time,
      sender: Number(seed.account?.id),
      text,
      attaches: [],
    }
    sent.set(cid, made)
    history.get(String(chatId))?.push(made)
    return { message: made }
  }

  return mockMax({
    answers: {
      [Opcode.SESSION_INIT]: {},
      [Opcode.LOGIN]: {
        profile: { contact: seed.account ? contact(seed.account.id) : {} },
        chats,
        contacts: seed.people.map((one) => contact(one.id)),
        time: Date.parse("2026-09-02T00:00:00.000Z"),
      },
      [Opcode.CONTACT_INFO]: ({ contactIds }) => ({
        contacts: (contactIds as number[]).map((id) => contact(String(id))),
      }),
      [Opcode.CHAT_HISTORY]: window,
      [Opcode.MSG_GET_REACTIONS]: { messagesReactions: {} },
      [Opcode.MSG_SEND]: send,
    },
    // The refusal MAX gives a chat it does not know was never measured for history; this is the one it gives to pin.
    refuse: {
      [Opcode.CHAT_HISTORY]: ({ chatId }) => (history.has(String(chatId)) ? undefined : "chat.not.found"),
    },
  })
}
