import * as v from "valibot"
import { defineOperation } from "../define.js"

/** Sent by `max serve` after each login, as a web tab does (`MAX-52`); the answer is kept only for its sync value. */
const recorded = "web.max.ru tab, recorded 2026-09-25 (`docs_ai/captures/2026-09-25-web-tab-2.jsonl`)"

export const ASSET_TYPES = ["STICKER", "FAVORITE_STICKER", "REACTION", "ANIMOJI_SET"] as const

export const assetsUpdate = defineOperation({
  name: "assets.update",
  constant: "ASSETS_UPDATE",
  opcode: 27,
  auth: true,
  guard: null,
  request: v.strictObject({ type: v.picklist(ASSET_TYPES), sync: v.number() }),
  response: v.looseObject({ sync: v.optional(v.number()), sections: v.optional(v.array(v.unknown())) }),
  provenance: {
    confidence: "measured",
    sources: [
      recorded,
      "PyMax 53103f0 names it `ASSETS_UPDATE` and never sends it",
      "`STICKER` answer measured 2026-10-08 on test account B: `{sync, sections: [{id, type, title, stickerSets: [ids]}], stickersOrder}`",
    ],
    notes: "The tab sends the four types in this order, each with the `sync` its previous answer carried.",
  },
})

export const assetsByIds = defineOperation({
  name: "assets.byIds",
  constant: "ASSETS_GET_BY_IDS",
  opcode: 28,
  auth: true,
  guard: null,
  request: v.strictObject({ type: v.picklist(["STICKER_SET", "STICKER"]), ids: v.array(v.number()) }),
  response: v.looseObject({
    stickerSets: v.optional(v.array(v.looseObject({}))),
    stickers: v.optional(v.array(v.looseObject({}))),
  }),
  provenance: {
    confidence: "measured",
    sources: [
      'web.max.ru chunk `_app/immutable/chunks/Cdo8IOYe.js`, read 2026-10-08: `send(28, {type: "STICKER_SET" | "STICKER", ids})`',
      "measured 2026-10-08 on test account B: a set is `{id, name, iconUrl, updateTime, stickers: [ids], link}`, a sticker `{id, width, height, tags, url, lottieUrl, updateTime, type, setId, authorType, fileId}`",
    ],
  },
})
