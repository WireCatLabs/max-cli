import type { Permission, SendKind } from "@leemour/cli-messaging/sends"

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

/**
 * How a bot write is journaled. `getUpdates` is absent on purpose: it is a write only because it
 * commits the marker, it reaches nobody, and a recipient list has nothing to say about it.
 */
export const BOT_JOURNAL_KINDS: Readonly<Record<string, SendKind>> = {
  sendMessage: "message",
  sendComment: "message",
  answerOnCallback: "message",
  sendAction: "chat",
  editMessage: "edit",
  editComment: "edit",
  deleteMessage: "delete",
  deleteComment: "delete",
  pinMessage: "pin",
  unpinMessage: "pin",
  editChat: "chat",
  leaveChat: "chat",
  postAdmins: "chat",
  deleteAdmins: "chat",
  addMembers: "chat",
  removeMember: "chat",
  editMyCommands: "account",
  subscribe: "account",
  unsubscribe: "account",
  getUploadUrl: "account",
}
