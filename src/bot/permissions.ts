import type { Permission } from "../sends/permissions.js"

/**
 * Which of the personal account's permission names (`CLI-37`) a bot write falls under, so one
 * `allow` list covers both. An operation missing here is refused whenever `allow` is set — a
 * write added by a future schema sync starts out forbidden, not allowed.
 */
export const BOT_PERMISSIONS: Readonly<Record<string, Permission>> = {
  sendMessage: "send",
  sendComment: "send",
  sendAction: "send",
  answerOnCallback: "send",
  getUploadUrl: "send",
  editMessage: "edit",
  editComment: "edit",
  deleteMessage: "delete",
  deleteComment: "delete",
  pinMessage: "pin",
  unpinMessage: "pin",
  editChat: "groups",
  leaveChat: "groups",
  postAdmins: "groups",
  deleteAdmins: "groups",
  addMembers: "groups",
  removeMember: "groups",
  editMyCommands: "profile",
  getUpdates: "read",
}
