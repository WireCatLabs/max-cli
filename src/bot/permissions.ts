import type { Permission, SendKind } from "@wirecat/cli-messaging/sends"

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

export const BOT_KEYS: Readonly<Record<string, string>> = {
  getMyInfo: "bot.me",
  editMyCommands: "bot.commands.set",
  getChat: "bot.chats.show",
  editChat: "bot.chats.update",
  sendAction: "bot.chats.action",
  getPinnedMessage: "bot.messages.pinned",
  pinMessage: "bot.messages.pin",
  unpinMessage: "bot.messages.unpin",
  getMembership: "bot.chats.members.me",
  leaveChat: "bot.chats.leave",
  getAdmins: "bot.chats.admins.list",
  postAdmins: "bot.chats.admins.add",
  deleteAdmins: "bot.chats.admins.remove",
  getMembers: "bot.chats.members.list",
  addMembers: "bot.chats.members.add",
  removeMember: "bot.chats.members.remove",
  getSubscriptions: "bot.webhooks.list",
  subscribe: "bot.webhooks.set",
  unsubscribe: "bot.webhooks.delete",
  getUploadUrl: "bot.uploads",
  getMessages: "bot.messages.list",
  sendMessage: "bot.messages.send",
  editMessage: "bot.messages.edit",
  deleteMessage: "bot.messages.delete",
  getMessageById: "bot.messages.show",
  getComments: "bot.messages.list",
  sendComment: "bot.messages.send",
  editComment: "bot.messages.edit",
  deleteComment: "bot.messages.delete",
  getCommentById: "bot.messages.show",
  getVideoAttachmentDetails: "bot.messages.download",
  answerOnCallback: "bot.buttons.press",
  getUpdates: "bot.updates.poll",
}
