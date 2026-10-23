/**
 * Does a poll work the way the web client's code says? Run by hand, never by CI.
 *
 *   pnpm probe:polls
 *
 * **Saved messages (chat 0) only**, which only the owner sees. One poll is created, read back,
 * voted in, the vote taken back, voted again, closed, read back, then deleted. The shapes are
 * web.max.ru's (`FIND-140`) and PyMax's. Printed: field names, numbers and this script's own text.
 */

import { MaxClient } from "../dist/client.js"
import { Connection } from "../dist/protocol/connection.js"
import { asId } from "../dist/protocol/frame.js"
import { SessionStore } from "../dist/session/store.js"
import { buildRequest } from "../dist/spec/define.js"
import { chatsHistory } from "../dist/spec/operations/chats.js"

const SAVED = "0"
const MULTIPLE = 2
const REVOTE = 4
const CLOSED = 8
/** Eight writes in 0.7 s once made MAX drop the connection and refuse the token (`smoke-live.ts`). */
const PACE_MS = 3000

const store = new SessionStore({ profile: process.env.MAX_PROFILE ?? "default" })
if (!store.readToken()) {
  console.error("no session on this profile — run `max session start` first")
  process.exit(2)
}

let connection = new Connection({ timeoutMs: 20_000 })
let client = new MaxClient({ store, connection, timeoutMs: 20_000 })
/** MAX closes the connection after a request it cannot read; the next step logs in again. */
let lost = false
const live = async () => {
  if (!lost) return
  await client.close().catch(() => {})
  connection = new Connection({ timeoutMs: 20_000 })
  client = new MaxClient({ store, connection, timeoutMs: 20_000 })
  await client.connect()
  lost = false
}

type Json = Record<string, unknown>
const record = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {}
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(record) : [])
const keys = (value: unknown) => Object.keys(record(value)).sort().join(",")
const reason = (error: unknown) =>
  String(record((error as { payload?: unknown }).payload).error ?? (error as Error).message)

const step = async (label: string, run: () => Promise<unknown>): Promise<Json | undefined> => {
  await new Promise((resolve) => setTimeout(resolve, PACE_MS))
  try {
    await live()
    const answer = record(await run())
    console.log(`ok    ${label}: answer keys=${keys(answer)}`)
    return answer
  } catch (error) {
    console.log(`FAIL  ${label}: ${reason(error)}`)
    lost = true
    return undefined
  }
}

const describe = (label: string, attach: Json | undefined) => {
  if (!attach) return console.log(`  ${label}: no POLL attachment`)
  const state = record(attach.state)
  console.log(`  ${label}: keys=${keys(attach)} settings=${String(attach.settings)} version=${String(attach.version)}`)
  console.log(
    `    answers: ${list(attach.answers)
      .map((each) => `${asId(each.answerId)}:${keys(each)}`)
      .join(" ")}`,
  )
  console.log(`    state keys=${keys(state)} total=${String(state.total)}`)
  for (const result of list(state.result)) {
    console.log(
      `    result ${asId(result.answerId)}: keys=${keys(result)} voteCount=${String(result.voteCount)} options=${String(result.options)}`,
    )
  }
}

const pollOf = (message: unknown): Json | undefined =>
  list(record(message).attaches).find((each) => each._type === "POLL")

const readBack = async (messageId: string): Promise<Json | undefined> => {
  await live()
  const history = record(
    await connection.invoke(
      chatsHistory.opcode,
      buildRequest(chatsHistory, {
        chatId: SAVED,
        from: Date.now() + 60_000,
        forward: 0,
        backward: 10,
        getMessages: true,
      }),
    ),
  )
  const message = list(history.messages).find((each) => asId(each.id) === messageId)
  if (message) console.log(`  message keys=${keys(message)}`)
  return pollOf(message)
}

let messageId: string | undefined
try {
  await step("login", () => client.connect())

  const created = await step("create (64)", () =>
    connection.invoke(64, {
      chatId: 0n,
      message: {
        cid: Date.now(),
        text: "",
        attaches: [
          {
            _type: "POLL",
            title: `max-cli probe poll ${new Date().toISOString()}`,
            answers: [{ text: "one" }, { text: "two" }, { text: "three" }],
            settings: MULTIPLE | REVOTE,
          },
        ],
      },
      notify: true,
    }),
  )
  messageId = asId(record(created?.message).id)
  console.log(`  send answer chatId=${String(asId(created?.chatId))} message keys=${keys(created?.message)}`)
  describe("in the send answer", pollOf(created?.message))
  if (!messageId) throw new Error("no message id in the send answer")

  const poll = await readBack(messageId)
  describe("read back", poll)
  const pollId = asId(poll?.pollId)
  const [first = "", second = "", third = first] = list(poll?.answers).map((each) => asId(each.answerId) ?? "")
  if (!pollId || !first || !second) throw new Error("no pollId or answer ids to vote with")
  // A bigint goes out wrapped as a 64-bit id; answer ids are small, and wrapped they were refused.
  let wrapPoll = true
  const vote = (ids: string[]) => ({
    chatId: 0n,
    messageId: BigInt(messageId as string),
    pollId: wrapPoll ? BigInt(pollId) : Number(pollId),
    answersIds: ids.map(Number),
  })

  let voted = await step("vote (304) for answer 1, answer ids plain", () => connection.invoke(304, vote([first])))
  if (!voted) {
    wrapPoll = false
    voted = await step("vote (304) for answer 1, poll id plain too", () => connection.invoke(304, vote([first])))
  }
  console.log(`  poll id went ${wrapPoll ? "wrapped" : "plain"}`)
  describe("in the vote answer", { _type: "POLL", ...record(voted) })
  describe("read back after vote", await readBack(messageId))

  const retracted = await step("take back (304) with no answers", () => connection.invoke(304, vote([])))
  describe("in the take-back answer", { _type: "POLL", ...record(retracted) })

  await step("vote (304) for answers 1 and 2", () => connection.invoke(304, vote([first, second])))
  describe("read back after two answers", await readBack(messageId))

  const current = await readBack(messageId)
  const closed = await step("close (67) with the closed bit", () =>
    connection.invoke(67, {
      chatId: 0n,
      messageId: BigInt(messageId as string),
      attachments: [
        {
          _type: "POLL",
          pollId: wrapPoll ? BigInt(pollId) : Number(pollId),
          title: current?.title,
          answers: list(current?.answers).map((each) => ({ text: each.text })),
          settings: Number(current?.settings ?? 0) | CLOSED,
        },
      ],
    }),
  )
  describe("in the close answer", pollOf(closed?.message))
  describe("read back after close", await readBack(messageId))

  await step("vote (304) on the closed poll", () => connection.invoke(304, vote([third])))
} finally {
  if (messageId) {
    const id = messageId
    await step("delete the poll (66)", () => client.messages.delete(SAVED, [id]))
  }
  await client.close().catch(() => {})
}
