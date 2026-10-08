import type { Entry, Operation, Reservation } from "./define.js"
import { accountCloseSessions, accountSessions, accountSettings, accountUpdate } from "./operations/account.js"
import { assetsByIds, assetsUpdate } from "./operations/assets.js"
import { attachmentsFile, attachmentsVideo } from "./operations/attachments.js"
import { bannersList } from "./operations/banners.js"
import { callsHistory } from "./operations/calls.js"
import {
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
} from "./operations/chats.js"
import {
  contactsByPhone,
  contactsImport,
  contactsInfo,
  contactsPresence,
  contactsUpdate,
  unidentified36,
} from "./operations/contacts.js"
import { foldersDelete, foldersList, foldersReorder, foldersUpdate } from "./operations/folders.js"
import {
  loginByQr,
  loginPassword,
  loginQrRequest,
  loginQrStatus,
  loginSmsCode,
  loginSmsRequest,
  qrApprove,
} from "./operations/login.js"
import {
  messagesDelete,
  messagesEdit,
  messagesMedia,
  messagesPollVote,
  messagesPress,
  messagesReact,
  messagesReactions,
  messagesSearch,
  messagesSend,
  messagesUnreact,
} from "./operations/messages.js"
import { sessionInit, sessionLog, sessionLogin, sessionLogout, sessionPing } from "./operations/session.js"
import { uploadsFile, uploadsPhoto, uploadsVideo } from "./operations/uploads.js"

export { checkResponse } from "./check.js"
export * from "./define.js"
export * from "./scalars.js"

/**
 * Every opcode this project knows, whether or not it is ever sent.
 *
 * **The order is the order it is read in**, and the generator preserves it: the registry, the
 * reference table and the coverage list all come out grouped the same way, which is what makes a
 * regenerated file a small diff instead of a reshuffle.
 */
export const spec: readonly Entry[] = [
  sessionInit,
  sessionLogin,
  sessionPing,
  sessionLog,
  sessionLogout,
  loginQrRequest,
  loginQrStatus,
  loginByQr,
  qrApprove,
  loginSmsRequest,
  loginSmsCode,
  loginPassword,
  contactsInfo,
  contactsPresence,
  contactsByPhone,
  contactsUpdate,
  contactsImport,
  unidentified36,
  accountUpdate,
  accountSettings,
  accountSessions,
  accountCloseSessions,
  foldersList,
  foldersUpdate,
  foldersDelete,
  foldersReorder,
  bannersList,
  callsHistory,
  assetsUpdate,
  assetsByIds,
  chatsHistory,
  chatsMark,
  chatsList,
  chatsLinkInfo,
  chatsJoin,
  chatsLeave,
  chatsUpdate,
  chatsMembers,
  chatsUpdateMembers,
  chatsDelete,
  chatsClear,
  messagesSend,
  messagesEdit,
  messagesReact,
  messagesPress,
  messagesUnreact,
  messagesPollVote,
  messagesReactions,
  messagesMedia,
  messagesSearch,
  messagesDelete,
  attachmentsVideo,
  attachmentsFile,
  uploadsPhoto,
  uploadsFile,
  uploadsVideo,
]

export const operations: readonly Operation[] = spec.filter((entry): entry is Operation => entry.kind === "operation")

export const reservations: readonly Reservation[] = spec.filter(
  (entry): entry is Reservation => entry.kind === "reservation",
)
