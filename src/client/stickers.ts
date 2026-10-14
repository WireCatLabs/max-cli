import { CliError } from "@wirecat/cli-base"
import { toSticker, toStickerSet } from "../domain/map.js"
import type { Id, Sticker, StickerSet } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import { asArray, numbers, record } from "./values.js"

interface Dependencies {
  connectOnce: () => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "assets">
}

export const createStickers = (deps: Dependencies) => {
  const resource = {
    sets: async (): Promise<StickerSet[]> => {
      await deps.connectOnce()
      const sections = asArray((await deps.wire.assets.update({ type: "STICKER", sync: 0 })).sections)
      const ids = [...new Set(sections.flatMap((section) => numbers(record(section)?.stickerSets)))]
      if (ids.length === 0) return []
      const answer = await deps.wire.assets.byIds({ type: "STICKER_SET", ids })
      return asArray(answer.stickerSets).map((raw) => toStickerSet(record(raw) ?? {}))
    },
    list: async (setId: Id): Promise<Sticker[]> => {
      await deps.connectOnce()
      const [set] = asArray((await deps.wire.assets.byIds({ type: "STICKER_SET", ids: [Number(setId)] })).stickerSets)
      if (set === undefined)
        throw new CliError("not_found", `no sticker set ${setId} — \`stickers list\` names the sets`)
      const ids = numbers(record(set)?.stickers)
      if (ids.length === 0) return []
      const answer = await deps.wire.assets.byIds({ type: "STICKER", ids })
      return asArray(answer.stickers).map((raw) => toSticker(record(raw) ?? {}))
    },
  }
  return { sets: resource.sets, list: resource.list }
}
