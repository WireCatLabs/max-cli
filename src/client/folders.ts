import { toFolder } from "../domain/map.js"
import type { Folder, Id } from "../domain/models.js"
import type { wireClient } from "../generated/client.generated.js"
import type { Payload } from "../protocol/frame.js"
import { ALL_CHATS_FOLDER, type FolderChange, folderTitle, pickFolder, record } from "./values.js"

interface Dependencies {
  folders: () => Promise<Payload[]>
  change: <T>(body: (done: () => void) => Promise<T>) => Promise<T>
  chatsResolve: (reference: string) => Promise<Id>
  readonly wire: Pick<ReturnType<typeof wireClient>, "folders">
}

export const createFolders = (deps: Dependencies) => {
  const resource = {
    list: async (): Promise<Folder[]> => (await deps.folders()).map(toFolder),
    create: (title: string, chats: string[] = []): Promise<Folder> =>
      deps.change(async () => {
        const include = await Promise.all(chats.map((chat) => deps.chatsResolve(chat)))
        const answer = await deps.wire.folders.update({
          id: crypto.randomUUID(),
          title: folderTitle(title),
          include,
          filters: [],
          options: [],
        })
        return toFolder(record(answer.folder) ?? {})
      }),
    update: (reference: string, change: FolderChange): Promise<Folder> =>
      deps.change(async () => {
        const folder = pickFolder(reference, await deps.folders())
        const added = await Promise.all((change.add ?? []).map((chat) => deps.chatsResolve(chat)))
        const removed = new Set(await Promise.all((change.remove ?? []).map((chat) => deps.chatsResolve(chat))))
        const touchesChats = added.length > 0 || removed.size > 0
        const current = toFolder(folder).chatIds
        const include = [...new Set([...current, ...added])].filter((id) => !removed.has(id))

        const answer = await deps.wire.folders.update({
          id: String(folder.id),
          title: change.title === undefined ? String(folder.title ?? "") : folderTitle(change.title),
          ...(Array.isArray(folder.include) || touchesChats ? { include } : {}),
          filters: Array.isArray(folder.filters) ? folder.filters : [],
          options: Array.isArray(folder.options) ? folder.options : [],
          ...(Array.isArray(folder.favorites) ? { favorites: folder.favorites } : {}),
        })
        return toFolder(record(answer.folder) ?? {})
      }),
    order: (ids: string[]): Promise<void> =>
      deps.change(async () => {
        const order = ids.includes(ALL_CHATS_FOLDER)
          ? [ALL_CHATS_FOLDER, ...ids.filter((id) => id !== ALL_CHATS_FOLDER)]
          : ids
        const current = (await deps.folders()).map((folder) => String(folder.id))
        if (order.join("\n") === current.join("\n")) return
        await deps.wire.folders.reorder({ foldersOrder: order })
      }),
    delete: (reference: string): Promise<Folder> =>
      deps.change(async () => {
        const folder = pickFolder(reference, await deps.folders())
        await deps.wire.folders.delete({ folderIds: [String(folder.id)] })
        return toFolder(folder)
      }),
  }
  return {
    list: resource.list,
    create: resource.create,
    update: resource.update,
    order: resource.order,
    delete: resource.delete,
  }
}
