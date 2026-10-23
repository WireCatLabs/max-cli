import * as v from "valibot"
import { defineOperation } from "../define.js"
import { id } from "../scalars.js"

/** Sent by `max serve` on its first login only, as a fresh web tab does (`MAX-52`); the answer is not read. */
const recorded = "web.max.ru tab, recorded 2026-09-25 (private capture 2026-09-25-web-tab-2.jsonl)"
const webClient = "web.max.ru chunk `_app/immutable/chunks/CLv-WKyI.js`, read 2026-10-23"

export const storiesList = defineOperation({
  name: "stories.list",
  constant: "STORIES_LIST",
  opcode: 208,
  auth: true,
  guard: null,
  request: v.strictObject({ cursor: v.string(), count: v.number() }),
  response: v.looseObject({ storiesPreviews: v.optional(v.unknown()) }),
  provenance: {
    confidence: "observed",
    sources: [recorded, webClient],
    notes: 'The stories bar asks `{cursor: "0", count: 15}` when it mounts. PyMax does not name it.',
  },
})

export const storiesPreviews = defineOperation({
  name: "stories.previews",
  constant: "STORIES_PREVIEWS",
  opcode: 209,
  auth: true,
  guard: null,
  request: v.strictObject({
    /** `type` 0 is a dialog with `ownerId` the other person, 1 a group, 2 a channel, both with the chat id. */
    owners: v.array(v.strictObject({ type: v.picklist([0, 1, 2]), ownerId: id() })),
  }),
  response: v.looseObject({ storiesPreviews: v.optional(v.unknown()) }),
  provenance: {
    confidence: "observed",
    sources: [recorded, webClient],
    notes: "The tab asks for the owners of each chat-list row it draws, up to 30 at once. PyMax does not name it.",
  },
})
