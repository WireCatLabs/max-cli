// Generated from src/spec/ by scripts/generate.ts. Do not edit; run `pnpm generate`.

import { accountCloseSessions, accountSessions, accountSettings, accountUpdate } from "../spec/operations/account.js"
import { assetsByIds, assetsUpdate } from "../spec/operations/assets.js"
import { attachmentsFile, attachmentsVideo } from "../spec/operations/attachments.js"
import { bannersList } from "../spec/operations/banners.js"
import { callsHistory } from "../spec/operations/calls.js"
import {
  chatsApp,
  chatsClear,
  chatsDelete,
  chatsHistory,
  chatsJoin,
  chatsLeave,
  chatsLinkInfo,
  chatsList,
  chatsMark,
  chatsMembers,
  chatsUpdate,
  chatsUpdateMembers,
} from "../spec/operations/chats.js"
import {
  contactsByPhone,
  contactsImport,
  contactsInfo,
  contactsPresence,
  contactsUpdate,
} from "../spec/operations/contacts.js"
import { foldersDelete, foldersList, foldersReorder, foldersUpdate } from "../spec/operations/folders.js"
import {
  loginByQr,
  loginPassword,
  loginQrRequest,
  loginQrStatus,
  loginSmsCode,
  loginSmsRequest,
} from "../spec/operations/login.js"
import {
  messagesDelete,
  messagesEdit,
  messagesMedia,
  messagesPollVote,
  messagesPress,
  messagesReact,
  messagesReactions,
  messagesSearch,
  messagesSearchGlobal,
  messagesSend,
  messagesUnreact,
} from "../spec/operations/messages.js"
import { sessionInit, sessionLog, sessionLogin, sessionLogout, sessionPing } from "../spec/operations/session.js"
import { uploadsFile, uploadsPhoto, uploadsVideo } from "../spec/operations/uploads.js"

/** Every operation that may be sent, by the name the client calls it. */
export const OPERATIONS = {
  "session.init": sessionInit,
  "session.login": sessionLogin,
  "session.ping": sessionPing,
  "session.log": sessionLog,
  "session.logout": sessionLogout,
  "login.qrRequest": loginQrRequest,
  "login.qrStatus": loginQrStatus,
  "login.byQr": loginByQr,
  "login.smsRequest": loginSmsRequest,
  "login.smsCode": loginSmsCode,
  "login.password": loginPassword,
  "contacts.info": contactsInfo,
  "contacts.presence": contactsPresence,
  "contacts.byPhone": contactsByPhone,
  "contacts.update": contactsUpdate,
  "contacts.import": contactsImport,
  "account.update": accountUpdate,
  "account.settings": accountSettings,
  "account.sessions": accountSessions,
  "account.closeSessions": accountCloseSessions,
  "folders.list": foldersList,
  "folders.update": foldersUpdate,
  "folders.delete": foldersDelete,
  "folders.reorder": foldersReorder,
  "banners.list": bannersList,
  "calls.history": callsHistory,
  "assets.update": assetsUpdate,
  "assets.byIds": assetsByIds,
  "chats.history": chatsHistory,
  "chats.mark": chatsMark,
  "chats.list": chatsList,
  "chats.linkInfo": chatsLinkInfo,
  "chats.join": chatsJoin,
  "chats.leave": chatsLeave,
  "chats.update": chatsUpdate,
  "chats.members": chatsMembers,
  "chats.updateMembers": chatsUpdateMembers,
  "chats.delete": chatsDelete,
  "chats.clear": chatsClear,
  "chats.app": chatsApp,
  "messages.send": messagesSend,
  "messages.edit": messagesEdit,
  "messages.react": messagesReact,
  "messages.press": messagesPress,
  "messages.unreact": messagesUnreact,
  "messages.pollVote": messagesPollVote,
  "messages.reactions": messagesReactions,
  "messages.media": messagesMedia,
  "messages.search": messagesSearch,
  "messages.searchGlobal": messagesSearchGlobal,
  "messages.delete": messagesDelete,
  "attachments.video": attachmentsVideo,
  "attachments.file": attachmentsFile,
  "uploads.photo": uploadsPhoto,
  "uploads.file": uploadsFile,
  "uploads.video": uploadsVideo,
} as const

export type OperationName = keyof typeof OPERATIONS
