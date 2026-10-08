import * as v from "valibot"
import { defineOperation } from "../define.js"

/** Sent by `max serve` after each login, as a web tab does (`MAX-52`); the answer is kept only for its sync value. */
const recorded = "web.max.ru tab, recorded 2026-09-25 (`docs_ai/captures/2026-09-25-web-tab-2.jsonl`)"

export const callsHistory = defineOperation({
  name: "calls.history",
  constant: "CALL_HISTORY",
  opcode: 163,
  auth: true,
  guard: null,
  request: v.strictObject({ callHistorySync: v.number() }),
  response: v.looseObject({
    callHistoryItems: v.optional(v.array(v.unknown())),
    callHistorySync: v.optional(v.number()),
  }),
  provenance: {
    confidence: "measured",
    sources: [
      recorded,
      "answer measured 2026-10-08 on test account B: `{callHistoryItems, callHistorySync, reset}`; an item is `{historyId, callId, callerId, chatId, messageId, callType, hangupType, time, durationMs}`",
    ],
    notes:
      "`callHistorySync: 0` answers the history from the start. `hangupType` is `HUNGUP`, `MISSED`, `REJECTED` or `CANCELED`, as web.max.ru names them (chunk `Cdo8IOYe`, 2026-10-08).",
  },
})
