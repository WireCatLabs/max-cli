import { CliError } from "@wirecat/cli-base"
import type { GroupMember, Id } from "@wirecat/cli-core"
import { toGroupMember } from "../domain/map.js"
import type { wireClient } from "../generated/client.generated.js"
import { asId, type Payload } from "../protocol/frame.js"
import type { GroupMembers } from "./shapes.js"
import { asArray, MEMBERS_PAGE, MEMBERS_READ, record } from "./values.js"

interface Dependencies {
  readonly offline: boolean
  chatsResolve: (reference: string) => Promise<Id>
  connectOnce: () => Promise<void>
  readonly wire: Pick<ReturnType<typeof wireClient>, "chats" | "folders">
  session: () => Payload
}

export const createChatMembers = (deps: Dependencies) => {
  async function members(
    reference: string,
    { limit, offset }: { limit?: number; offset: number } = { offset: 0 },
  ): Promise<GroupMembers & { hasMore: boolean; truncated: boolean; readCount: number }> {
    if (deps.offline) throw new CliError("validation_error", "`--offline` has no member list; MAX has")
    const chatId = await deps.chatsResolve(reference)
    await deps.connectOnce()
    const members = new Map<Id, GroupMember>()
    const target = limit === undefined ? MEMBERS_READ : Math.min(MEMBERS_READ, offset + limit + 1)
    let marker = 0
    let complete = false
    while (members.size < target) {
      const answer = await deps.wire.chats.members({ chatId, type: "MEMBER", marker, count: MEMBERS_PAGE })
      const before = members.size
      for (const raw of asArray(answer.members)) {
        const member = toGroupMember(raw)
        if (member.id) members.set(member.id, member)
      }
      const next = typeof answer.marker === "number" ? answer.marker : 0
      if (!next || next === marker || members.size === before) {
        complete = !next
        break
      }
      marker = next
    }
    const roles = await readRoles(chatId)
    const role = (id: Id) => (id === roles?.owner ? "owner" : roles?.admins.has(id) ? "admin" : "member")
    const end = limit === undefined ? members.size : offset + limit
    return {
      chatId,
      members: [...members.values()]
        .slice(offset, end)
        .map((member) => (roles ? { ...member, role: role(member.id) } : member)),
      complete,
      rolesKnown: roles !== undefined,
      hasMore: end < members.size,
      truncated: !complete && (members.size < target || members.size >= MEMBERS_READ),
      readCount: members.size,
    }
  }

  async function readRoles(chatId: Id): Promise<{ owner?: Id; admins: Set<Id> } | undefined> {
    await deps.connectOnce()
    const raw = asArray(deps.session().chats).find((chat) => asId(chat.id) === chatId)
    if (!raw || (raw.owner === undefined && raw.admins === undefined && raw.adminParticipants === undefined)) {
      return undefined
    }
    const admins = [
      ...(Array.isArray(raw.admins) ? raw.admins.map(asId) : []),
      ...Object.keys(record(raw.adminParticipants) ?? {}),
    ].filter((id): id is Id => id !== undefined)
    const owner = asId(raw.owner)
    return { ...(owner ? { owner } : {}), admins: new Set(admins.filter((id) => id !== owner)) }
  }

  async function readFolders(): Promise<Payload[]> {
    if (deps.offline)
      throw new CliError("validation_error", "`--offline` reads what was recorded, and folders are not recorded")
    await deps.connectOnce()
    const answer = await deps.wire.folders.list({ folderSync: 0 })
    const folders = asArray(answer.folders)
    const order = Array.isArray(answer.foldersOrder) ? answer.foldersOrder.map(String) : []
    const rank = (folder: Payload) => {
      const at = order.indexOf(String(folder.id))
      return at === -1 ? order.length : at
    }
    return [...folders].sort((a, b) => rank(a) - rank(b))
  }
  return { members: members, roles: readRoles, folders: readFolders }
}
