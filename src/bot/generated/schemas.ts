// GENERATED. DO NOT EDIT.
// Source: spec/bot/schema.yaml
// Run: pnpm bot:generate

import { int64, integer, number, unique } from "@wirecat/cli-core/codegen/runtime"
import * as v from "valibot"
import type * as T from "./types.js"

export const Bigint: v.GenericSchema<unknown, T.Bigint> = int64()

export const UserId: v.GenericSchema<unknown, T.UserId> = int64()

export const ChatId: v.GenericSchema<unknown, T.ChatId> = int64()

export const MessageId: v.GenericSchema<unknown, T.MessageId> = v.pipe(v.string(), v.minLength(1))

export const Url: v.GenericSchema<unknown, T.Url> = v.string()

export const SubscriptionUrl: v.GenericSchema<unknown, T.SubscriptionUrl> = v.string()

export const User: v.GenericSchema<unknown, T.User> = v.looseObject({
  user_id: v.lazy(() => UserId),
  first_name: v.string(),
  last_name: v.optional(v.nullable(v.string())),
  username: v.optional(v.nullable(v.string())),
  is_bot: v.boolean(),
  last_activity_time: v.optional(v.nullable(int64())),
})

export const UserWithPhoto: v.GenericSchema<unknown, T.UserWithPhoto> = v.looseObject({
  user_id: v.lazy(() => UserId),
  first_name: v.string(),
  last_name: v.optional(v.nullable(v.string())),
  username: v.optional(v.nullable(v.string())),
  is_bot: v.boolean(),
  last_activity_time: v.optional(v.nullable(int64())),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(16000)))),
  avatar_url: v.optional(v.nullable(v.string())),
  full_avatar_url: v.optional(v.nullable(v.string())),
})

export const BotInfo: v.GenericSchema<unknown, T.BotInfo> = v.looseObject({
  user_id: v.lazy(() => UserId),
  first_name: v.string(),
  last_name: v.optional(v.nullable(v.string())),
  username: v.optional(v.nullable(v.string())),
  is_bot: v.boolean(),
  last_activity_time: v.optional(v.nullable(int64())),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(16000)))),
  avatar_url: v.optional(v.nullable(v.string())),
  full_avatar_url: v.optional(v.nullable(v.string())),
  commands: v.optional(v.nullable(v.pipe(v.array(v.lazy(() => BotCommand)), v.maxLength(32)))),
})

export const BotCommandsInfo: v.GenericSchema<unknown, T.BotCommandsInfo> = v.looseObject({
  commands: v.optional(v.nullable(v.pipe(v.array(v.lazy(() => BotCommand)), v.maxLength(32)))),
})

export const BotCommandsPatch: v.GenericSchema<unknown, T.BotCommandsPatch> = v.looseObject({
  commands: v.optional(v.pipe(v.array(v.lazy(() => BotCommand)), v.maxLength(32))),
})

export const BotCommand: v.GenericSchema<unknown, T.BotCommand> = v.looseObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  description: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(128)))),
})

export const Chat: v.GenericSchema<unknown, T.Chat> = v.looseObject({
  chat_id: v.lazy(() => ChatId),
  type: v.lazy(() => ChatType),
  status: v.lazy(() => ChatStatus),
  title: v.optional(v.nullable(v.string())),
  icon: v.optional(v.nullable(v.lazy(() => Image))),
  last_event_time: int64(),
  participants_count: integer(),
  owner_id: v.optional(v.nullable(v.lazy(() => UserId))),
  participants: v.optional(v.nullable(v.record(v.string(), int64()))),
  is_public: v.boolean(),
  link: v.optional(v.nullable(v.string())),
  description: v.optional(v.nullable(v.string())),
  dialog_with_user: v.optional(v.nullable(v.lazy(() => UserWithPhoto))),
  messages_count: v.optional(v.nullable(integer())),
  pinned_message: v.optional(v.nullable(v.lazy(() => Message))),
})

export const ChatType: v.GenericSchema<unknown, T.ChatType> = v.picklist(["dialog", "chat", "channel"])

export const ChatStatus: v.GenericSchema<unknown, T.ChatStatus> = v.picklist([
  "active",
  "removed",
  "left",
  "closed",
  "suspended",
])

export const ChatList: v.GenericSchema<unknown, T.ChatList> = v.looseObject({
  chats: v.array(v.lazy(() => Chat)),
  marker: v.optional(v.nullable(int64())),
})

export const ChatPatch: v.GenericSchema<unknown, T.ChatPatch> = v.looseObject({
  icon: v.optional(v.nullable(v.lazy(() => PhotoAttachmentRequestPayload))),
  title: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(200)))),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(16000)))),
  pin: v.optional(v.nullable(v.string())),
  notify: v.optional(v.nullable(v.boolean())),
})

export const ChatMember: v.GenericSchema<unknown, T.ChatMember> = v.looseObject({
  user_id: v.lazy(() => UserId),
  first_name: v.string(),
  last_name: v.optional(v.nullable(v.string())),
  username: v.optional(v.nullable(v.string())),
  is_bot: v.boolean(),
  last_activity_time: v.optional(v.nullable(int64())),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(16000)))),
  avatar_url: v.optional(v.nullable(v.string())),
  full_avatar_url: v.optional(v.nullable(v.string())),
  last_access_time: int64(),
  is_owner: v.boolean(),
  is_admin: v.boolean(),
  join_time: int64(),
  permissions: v.optional(
    v.nullable(
      v.pipe(
        v.array(v.lazy(() => ChatAdminPermission)),
        v.check((items) => unique(items), "items must be unique"),
      ),
    ),
  ),
  alias: v.optional(v.nullable(v.string())),
})

export const ChatAdminPermission: v.GenericSchema<unknown, T.ChatAdminPermission> = v.picklist([
  "read_all_messages",
  "add_remove_members",
  "add_admins",
  "change_chat_info",
  "pin_message",
  "edit_link",
  "write",
  "edit",
  "delete",
  "can_call",
  "view_stats",
])

export const ChatMembersList: v.GenericSchema<unknown, T.ChatMembersList> = v.looseObject({
  members: v.array(v.lazy(() => ChatMember)),
  marker: v.optional(v.nullable(int64())),
})

export const Image: v.GenericSchema<unknown, T.Image> = v.looseObject({
  url: v.string(),
})

export const Subscription: v.GenericSchema<unknown, T.Subscription> = v.looseObject({
  url: v.string(),
  time: int64(),
  update_types: v.optional(
    v.nullable(
      v.pipe(
        v.array(v.pipe(v.string(), v.minLength(1))),
        v.check((items) => unique(items), "items must be unique"),
      ),
    ),
  ),
})

export const Recipient: v.GenericSchema<unknown, T.Recipient> = v.looseObject({
  chat_id: v.optional(v.nullable(v.lazy(() => ChatId))),
  chat_type: v.lazy(() => ChatType),
  user_id: v.optional(v.nullable(v.lazy(() => UserId))),
  post_id: v.optional(v.nullable(v.lazy(() => MessageId))),
})

export const Message: v.GenericSchema<unknown, T.Message> = v.looseObject({
  sender: v.optional(v.nullable(v.lazy(() => User))),
  recipient: v.lazy(() => Recipient),
  timestamp: int64(),
  link: v.optional(v.nullable(v.lazy(() => LinkedMessage))),
  body: v.lazy(() => MessageBody),
  stat: v.optional(v.nullable(v.lazy(() => MessageStat))),
  url: v.optional(v.nullable(v.string())),
})

export const CommentMessage: v.GenericSchema<unknown, T.CommentMessage> = v.looseObject({
  sender: v.optional(v.nullable(v.lazy(() => User))),
  recipient: v.lazy(() => Recipient),
  timestamp: int64(),
  link: v.optional(v.nullable(v.lazy(() => CommentLinkedMessage))),
  body: v.lazy(() => CommentMessageBody),
  stat: v.optional(v.nullable(v.lazy(() => MessageStat))),
})

export const MessageStat: v.GenericSchema<unknown, T.MessageStat> = v.looseObject({
  views: integer(),
})

export const MessageBody: v.GenericSchema<unknown, T.MessageBody> = v.looseObject({
  mid: v.lazy(() => MessageId),
  seq: int64(),
  text: v.optional(v.nullable(v.string())),
  attachments: v.optional(v.nullable(v.array(v.lazy(() => Attachment)))),
  markup: v.optional(v.nullable(v.array(v.lazy(() => MarkupElement)))),
})

export const CommentMessageBody: v.GenericSchema<unknown, T.CommentMessageBody> = v.looseObject({
  mid: v.lazy(() => MessageId),
  seq: int64(),
  text: v.optional(v.nullable(v.string())),
  markup: v.optional(v.nullable(v.array(v.lazy(() => MarkupElement)))),
})

export const MessageList: v.GenericSchema<unknown, T.MessageList> = v.looseObject({
  messages: v.array(v.lazy(() => Message)),
})

export const CommentMessageList: v.GenericSchema<unknown, T.CommentMessageList> = v.looseObject({
  messages: v.array(v.lazy(() => CommentMessage)),
})

export const TextFormat: v.GenericSchema<unknown, T.TextFormat> = v.picklist(["markdown", "html"])

export const NewMessageBody: v.GenericSchema<unknown, T.NewMessageBody> = v.looseObject({
  text: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(4000)))),
  attachments: v.optional(v.nullable(v.array(v.lazy(() => AttachmentRequest)))),
  link: v.optional(v.nullable(v.lazy(() => NewMessageLink))),
  notify: v.optional(v.boolean()),
  format: v.optional(v.nullable(v.lazy(() => TextFormat))),
})

export const NewCommentBody: v.GenericSchema<unknown, T.NewCommentBody> = v.looseObject({
  text: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(4000)))),
  link: v.optional(v.nullable(v.lazy(() => NewMessageLink))),
  format: v.optional(v.nullable(v.lazy(() => TextFormat))),
})

export const NewMessageLink: v.GenericSchema<unknown, T.NewMessageLink> = v.looseObject({
  type: v.lazy(() => MessageLinkType),
  mid: v.lazy(() => MessageId),
})

export const LinkedMessage: v.GenericSchema<unknown, T.LinkedMessage> = v.looseObject({
  type: v.lazy(() => MessageLinkType),
  sender: v.optional(v.nullable(v.lazy(() => User))),
  chat_id: v.optional(v.lazy(() => ChatId)),
  message: v.lazy(() => MessageBody),
})

export const CommentLinkedMessage: v.GenericSchema<unknown, T.CommentLinkedMessage> = v.looseObject({
  type: v.lazy(() => MessageLinkType),
  sender: v.optional(v.nullable(v.lazy(() => User))),
  chat_id: v.optional(v.lazy(() => ChatId)),
  message: v.lazy(() => CommentMessageBody),
})

export const SendMessageResult: v.GenericSchema<unknown, T.SendMessageResult> = v.looseObject({
  message: v.lazy(() => Message),
})

export const SendCommentResult: v.GenericSchema<unknown, T.SendCommentResult> = v.looseObject({
  message: v.lazy(() => CommentMessage),
})

export const Attachment: v.GenericSchema<unknown, T.Attachment> = v.union([
  v.lazy(() => PhotoAttachment),
  v.lazy(() => VideoAttachment),
  v.lazy(() => AudioAttachment),
  v.lazy(() => FileAttachment),
  v.lazy(() => StickerAttachment),
  v.lazy(() => ContactAttachment),
  v.lazy(() => InlineKeyboardAttachment),
  v.lazy(() => ShareAttachment),
  v.lazy(() => LocationAttachment),
])

export const PhotoAttachment: v.GenericSchema<unknown, T.PhotoAttachment> = v.looseObject({
  type: v.literal("image"),
  payload: v.lazy(() => PhotoAttachmentPayload),
})

export const PhotoAttachmentPayload: v.GenericSchema<unknown, T.PhotoAttachmentPayload> = v.looseObject({
  photo_id: int64(),
  token: v.string(),
  url: v.string(),
})

export const VideoAttachment: v.GenericSchema<unknown, T.VideoAttachment> = v.looseObject({
  type: v.literal("video"),
  payload: v.lazy(() => MediaAttachmentPayload),
  thumbnail: v.optional(v.nullable(v.lazy(() => VideoThumbnail))),
  width: v.optional(v.nullable(integer())),
  height: v.optional(v.nullable(integer())),
  duration: v.optional(v.nullable(integer())),
})

export const VideoThumbnail: v.GenericSchema<unknown, T.VideoThumbnail> = v.looseObject({
  url: v.string(),
})

export const VideoUrls: v.GenericSchema<unknown, T.VideoUrls> = v.looseObject({
  mp4_1080: v.optional(v.nullable(v.string())),
  mp4_720: v.optional(v.nullable(v.string())),
  mp4_480: v.optional(v.nullable(v.string())),
  mp4_360: v.optional(v.nullable(v.string())),
  mp4_240: v.optional(v.nullable(v.string())),
  mp4_144: v.optional(v.nullable(v.string())),
  hls: v.optional(v.nullable(v.string())),
})

export const VideoAttachmentDetails: v.GenericSchema<unknown, T.VideoAttachmentDetails> = v.looseObject({
  token: v.string(),
  urls: v.optional(v.nullable(v.lazy(() => VideoUrls))),
  thumbnail: v.optional(v.nullable(v.lazy(() => PhotoAttachmentPayload))),
  width: integer(),
  height: integer(),
  duration: integer(),
})

export const AudioAttachment: v.GenericSchema<unknown, T.AudioAttachment> = v.looseObject({
  type: v.literal("audio"),
  payload: v.lazy(() => MediaAttachmentPayload),
  transcription: v.optional(v.nullable(v.string())),
})

export const FileAttachment: v.GenericSchema<unknown, T.FileAttachment> = v.looseObject({
  type: v.literal("file"),
  payload: v.lazy(() => FileAttachmentPayload),
  filename: v.string(),
  size: int64(),
})

export const AttachmentPayload: v.GenericSchema<unknown, T.AttachmentPayload> = v.looseObject({
  url: v.string(),
})

export const MediaAttachmentPayload: v.GenericSchema<unknown, T.MediaAttachmentPayload> = v.looseObject({
  url: v.string(),
  token: v.string(),
})

export const FileAttachmentPayload: v.GenericSchema<unknown, T.FileAttachmentPayload> = v.looseObject({
  url: v.string(),
  token: v.string(),
})

export const ContactAttachment: v.GenericSchema<unknown, T.ContactAttachment> = v.looseObject({
  type: v.literal("contact"),
  payload: v.lazy(() => ContactAttachmentPayload),
})

export const ContactAttachmentPayload: v.GenericSchema<unknown, T.ContactAttachmentPayload> = v.looseObject({
  vcf_info: v.optional(v.nullable(v.string())),
  hash: v.optional(v.nullable(v.string())),
  max_info: v.optional(v.nullable(v.lazy(() => User))),
})

export const StickerAttachmentPayload: v.GenericSchema<unknown, T.StickerAttachmentPayload> = v.looseObject({
  url: v.string(),
  code: v.string(),
})

export const StickerAttachment: v.GenericSchema<unknown, T.StickerAttachment> = v.looseObject({
  type: v.literal("sticker"),
  payload: v.lazy(() => StickerAttachmentPayload),
  width: integer(),
  height: integer(),
})

export const ShareAttachmentPayload: v.GenericSchema<unknown, T.ShareAttachmentPayload> = v.looseObject({
  url: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  token: v.optional(v.nullable(v.string())),
})

export const ShareAttachment: v.GenericSchema<unknown, T.ShareAttachment> = v.looseObject({
  type: v.literal("share"),
  payload: v.lazy(() => ShareAttachmentPayload),
  title: v.optional(v.nullable(v.string())),
  description: v.optional(v.nullable(v.string())),
  image_url: v.optional(v.nullable(v.string())),
})

export const LocationAttachment: v.GenericSchema<unknown, T.LocationAttachment> = v.looseObject({
  type: v.literal("location"),
  latitude: number(),
  longitude: number(),
})

export const InlineKeyboardAttachment: v.GenericSchema<unknown, T.InlineKeyboardAttachment> = v.looseObject({
  type: v.literal("inline_keyboard"),
  payload: v.lazy(() => Keyboard),
})

export const Keyboard: v.GenericSchema<unknown, T.Keyboard> = v.looseObject({
  buttons: v.array(v.array(v.lazy(() => Button))),
})

export const Button: v.GenericSchema<unknown, T.Button> = v.union([
  v.lazy(() => CallbackButton),
  v.lazy(() => LinkButton),
  v.lazy(() => RequestGeoLocationButton),
  v.lazy(() => RequestContactButton),
  v.lazy(() => MessageButton),
  v.lazy(() => OpenAppButton),
  v.lazy(() => ClipboardButton),
])

export const CallbackButton: v.GenericSchema<unknown, T.CallbackButton> = v.looseObject({
  type: v.literal("callback"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  payload: v.pipe(v.string(), v.maxLength(1024)),
})

export const LinkButton: v.GenericSchema<unknown, T.LinkButton> = v.looseObject({
  type: v.literal("link"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  url: v.pipe(v.string(), v.maxLength(2048)),
})

export const MessageButton: v.GenericSchema<unknown, T.MessageButton> = v.looseObject({
  type: v.literal("message"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
})

export const RequestContactButton: v.GenericSchema<unknown, T.RequestContactButton> = v.looseObject({
  type: v.literal("request_contact"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
})

export const RequestGeoLocationButton: v.GenericSchema<unknown, T.RequestGeoLocationButton> = v.looseObject({
  type: v.literal("request_geo_location"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  quick: v.optional(v.boolean()),
})

export const OpenAppButton: v.GenericSchema<unknown, T.OpenAppButton> = v.looseObject({
  type: v.literal("open_app"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  payload: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(512), v.regex(/^[\w-]*$/)))),
  web_app: v.string(),
  contact_id: v.optional(v.nullable(v.lazy(() => UserId))),
})

export const ClipboardButton: v.GenericSchema<unknown, T.ClipboardButton> = v.looseObject({
  type: v.literal("clipboard"),
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  payload: v.pipe(v.string(), v.maxLength(1024)),
})

export const MessageLinkType: v.GenericSchema<unknown, T.MessageLinkType> = v.picklist(["forward", "reply"])

export const AttachmentRequest: v.GenericSchema<unknown, T.AttachmentRequest> = v.union([
  v.lazy(() => PhotoAttachmentRequest),
  v.lazy(() => VideoAttachmentRequest),
  v.lazy(() => AudioAttachmentRequest),
  v.lazy(() => FileAttachmentRequest),
  v.lazy(() => StickerAttachmentRequest),
  v.lazy(() => ContactAttachmentRequest),
  v.lazy(() => InlineKeyboardAttachmentRequest),
  v.lazy(() => LocationAttachmentRequest),
  v.lazy(() => ShareAttachmentRequest),
])

export const PhotoAttachmentRequest: v.GenericSchema<unknown, T.PhotoAttachmentRequest> = v.looseObject({
  type: v.literal("image"),
  payload: v.lazy(() => PhotoAttachmentRequestPayload),
})

export const PhotoAttachmentRequestPayload: v.GenericSchema<unknown, T.PhotoAttachmentRequestPayload> = v.looseObject({
  url: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  token: v.optional(v.nullable(v.string())),
  photos: v.optional(
    v.nullable(
      v.record(
        v.string(),
        v.lazy(() => PhotoToken),
      ),
    ),
  ),
})

export const PhotoToken: v.GenericSchema<unknown, T.PhotoToken> = v.looseObject({
  token: v.string(),
})

export const VideoAttachmentRequest: v.GenericSchema<unknown, T.VideoAttachmentRequest> = v.looseObject({
  type: v.literal("video"),
  payload: v.lazy(() => UploadedInfo),
})

export const AudioAttachmentRequest: v.GenericSchema<unknown, T.AudioAttachmentRequest> = v.looseObject({
  type: v.literal("audio"),
  payload: v.lazy(() => UploadedInfo),
})

export const UploadedInfo: v.GenericSchema<unknown, T.UploadedInfo> = v.looseObject({
  token: v.optional(v.string()),
})

export const FileAttachmentRequest: v.GenericSchema<unknown, T.FileAttachmentRequest> = v.looseObject({
  type: v.literal("file"),
  payload: v.lazy(() => UploadedInfo),
})

export const UploadType: v.GenericSchema<unknown, T.UploadType> = v.picklist(["image", "video", "audio", "file"])

export const ContactAttachmentRequest: v.GenericSchema<unknown, T.ContactAttachmentRequest> = v.looseObject({
  type: v.literal("contact"),
  payload: v.lazy(() => ContactAttachmentRequestPayload),
})

export const ContactAttachmentRequestPayload: v.GenericSchema<unknown, T.ContactAttachmentRequestPayload> =
  v.looseObject({
    name: v.optional(v.nullable(v.string())),
    contact_id: v.optional(v.nullable(v.lazy(() => UserId))),
    vcf_info: v.optional(v.nullable(v.string())),
    vcf_phone: v.optional(v.nullable(v.string())),
  })

export const StickerAttachmentRequest: v.GenericSchema<unknown, T.StickerAttachmentRequest> = v.looseObject({
  type: v.literal("sticker"),
  payload: v.lazy(() => StickerAttachmentRequestPayload),
})

export const StickerAttachmentRequestPayload: v.GenericSchema<unknown, T.StickerAttachmentRequestPayload> =
  v.looseObject({
    code: v.string(),
  })

export const InlineKeyboardAttachmentRequest: v.GenericSchema<unknown, T.InlineKeyboardAttachmentRequest> =
  v.looseObject({
    type: v.literal("inline_keyboard"),
    payload: v.lazy(() => InlineKeyboardAttachmentRequestPayload),
  })

export const InlineKeyboardAttachmentRequestPayload: v.GenericSchema<
  unknown,
  T.InlineKeyboardAttachmentRequestPayload
> = v.looseObject({
  buttons: v.pipe(v.array(v.array(v.lazy(() => Button))), v.minLength(1)),
})

export const LocationAttachmentRequest: v.GenericSchema<unknown, T.LocationAttachmentRequest> = v.looseObject({
  type: v.literal("location"),
  latitude: number(),
  longitude: number(),
})

export const ShareAttachmentRequest: v.GenericSchema<unknown, T.ShareAttachmentRequest> = v.looseObject({
  type: v.literal("share"),
  payload: v.lazy(() => ShareAttachmentPayload),
})

export const MarkupElement: v.GenericSchema<unknown, T.MarkupElement> = v.union([
  v.lazy(() => StrongMarkup),
  v.lazy(() => EmphasizedMarkup),
  v.lazy(() => MonospacedMarkup),
  v.lazy(() => LinkMarkup),
  v.lazy(() => StrikethroughMarkup),
  v.lazy(() => UnderlineMarkup),
  v.lazy(() => UserMentionMarkup),
  v.lazy(() => HeadingMarkup),
  v.lazy(() => HighlightedMarkup),
  v.lazy(() => QuoteMarkup),
])

export const StrongMarkup: v.GenericSchema<unknown, T.StrongMarkup> = v.looseObject({
  type: v.literal("strong"),
  from: integer(),
  length: integer(),
})

export const EmphasizedMarkup: v.GenericSchema<unknown, T.EmphasizedMarkup> = v.looseObject({
  type: v.literal("emphasized"),
  from: integer(),
  length: integer(),
})

export const MonospacedMarkup: v.GenericSchema<unknown, T.MonospacedMarkup> = v.looseObject({
  type: v.literal("monospaced"),
  from: integer(),
  length: integer(),
})

export const LinkMarkup: v.GenericSchema<unknown, T.LinkMarkup> = v.looseObject({
  type: v.literal("link"),
  from: integer(),
  length: integer(),
  url: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
})

export const StrikethroughMarkup: v.GenericSchema<unknown, T.StrikethroughMarkup> = v.looseObject({
  type: v.literal("strikethrough"),
  from: integer(),
  length: integer(),
})

export const UnderlineMarkup: v.GenericSchema<unknown, T.UnderlineMarkup> = v.looseObject({
  type: v.literal("underline"),
  from: integer(),
  length: integer(),
})

export const HeadingMarkup: v.GenericSchema<unknown, T.HeadingMarkup> = v.looseObject({
  type: v.literal("heading"),
  from: integer(),
  length: integer(),
})

export const UserMentionMarkup: v.GenericSchema<unknown, T.UserMentionMarkup> = v.looseObject({
  type: v.literal("user_mention"),
  from: integer(),
  length: integer(),
  user_link: v.optional(v.nullable(v.string())),
  user_id: v.optional(v.nullable(v.lazy(() => UserId))),
})

export const HighlightedMarkup: v.GenericSchema<unknown, T.HighlightedMarkup> = v.looseObject({
  type: v.literal("highlighted"),
  from: integer(),
  length: integer(),
})

export const QuoteMarkup: v.GenericSchema<unknown, T.QuoteMarkup> = v.looseObject({
  type: v.literal("quote"),
  from: integer(),
  length: integer(),
})

export const SubscriptionRequestBody: v.GenericSchema<unknown, T.SubscriptionRequestBody> = v.looseObject({
  url: v.lazy(() => SubscriptionUrl),
  secret: v.optional(v.pipe(v.string(), v.minLength(5), v.maxLength(256), v.regex(/^[\w-]+$/))),
  update_types: v.optional(
    v.pipe(
      v.array(v.string()),
      v.check((items) => unique(items), "items must be unique"),
    ),
  ),
})

export const GetSubscriptionsResult: v.GenericSchema<unknown, T.GetSubscriptionsResult> = v.looseObject({
  subscriptions: v.array(v.lazy(() => Subscription)),
})

export const SimpleQueryResult: v.GenericSchema<unknown, T.SimpleQueryResult> = v.looseObject({
  success: v.boolean(),
  message: v.optional(v.string()),
})

export const PinMessageBody: v.GenericSchema<unknown, T.PinMessageBody> = v.looseObject({
  message_id: v.lazy(() => MessageId),
  notify: v.optional(v.nullable(v.boolean())),
})

export const GetPinnedMessageResult: v.GenericSchema<unknown, T.GetPinnedMessageResult> = v.looseObject({
  message: v.optional(v.nullable(v.lazy(() => Message))),
})

export const Callback: v.GenericSchema<unknown, T.Callback> = v.looseObject({
  timestamp: int64(),
  callback_id: v.string(),
  payload: v.optional(v.string()),
  user: v.lazy(() => User),
})

export const CallbackAnswer: v.GenericSchema<unknown, T.CallbackAnswer> = v.looseObject({
  message: v.optional(v.nullable(v.lazy(() => NewMessageBody))),
  notification: v.optional(v.nullable(v.string())),
})

export const ApiError: v.GenericSchema<unknown, T.ApiError> = v.looseObject({
  error: v.optional(v.string()),
  code: v.string(),
  message: v.string(),
})

export const UploadEndpoint: v.GenericSchema<unknown, T.UploadEndpoint> = v.looseObject({
  url: v.string(),
  token: v.optional(v.nullable(v.string())),
})

export const UserIdsList: v.GenericSchema<unknown, T.UserIdsList> = v.looseObject({
  user_ids: v.pipe(v.array(v.lazy(() => UserId)), v.maxLength(100)),
})

export const ActionRequestBody: v.GenericSchema<unknown, T.ActionRequestBody> = v.looseObject({
  action: v.lazy(() => SenderAction),
})

export const ChatAdminsList: v.GenericSchema<unknown, T.ChatAdminsList> = v.looseObject({
  admins: v.array(v.lazy(() => ChatAdmin)),
})

export const ChatAdmin: v.GenericSchema<unknown, T.ChatAdmin> = v.looseObject({
  user_id: v.lazy(() => UserId),
  permissions: v.pipe(
    v.array(v.lazy(() => ChatAdminPermission)),
    v.check((items) => unique(items), "items must be unique"),
  ),
  alias: v.optional(v.nullable(v.string())),
})

export const SenderAction: v.GenericSchema<unknown, T.SenderAction> = v.picklist([
  "typing_on",
  "sending_photo",
  "sending_video",
  "sending_audio",
  "sending_file",
  "mark_seen",
])

export const UpdateList: v.GenericSchema<unknown, T.UpdateList> = v.looseObject({
  updates: v.array(v.lazy(() => Update)),
  marker: v.optional(v.nullable(int64())),
})

export const Update: v.GenericSchema<unknown, T.Update> = v.union([
  v.lazy(() => MessageCreatedUpdate),
  v.lazy(() => MessageCallbackUpdate),
  v.lazy(() => MessageEditedUpdate),
  v.lazy(() => MessageRemovedUpdate),
  v.lazy(() => CommentCreatedUpdate),
  v.lazy(() => CommentEditedUpdate),
  v.lazy(() => CommentRemovedUpdate),
  v.lazy(() => BotAddedToChatUpdate),
  v.lazy(() => BotRemovedFromChatUpdate),
  v.lazy(() => UserAddedToChatUpdate),
  v.lazy(() => UserRemovedFromChatUpdate),
  v.lazy(() => BotStartedUpdate),
  v.lazy(() => BotStoppedUpdate),
  v.lazy(() => DialogClearedUpdate),
  v.lazy(() => DialogRemovedUpdate),
  v.lazy(() => DialogMutedUpdate),
  v.lazy(() => DialogUnmutedUpdate),
  v.lazy(() => ChatTitleChangedUpdate),
  v.lazy(() => BotAdminPermissionsChangedUpdate),
])

export const MessageCallbackUpdate: v.GenericSchema<unknown, T.MessageCallbackUpdate> = v.looseObject({
  update_type: v.literal("message_callback"),
  timestamp: int64(),
  callback: v.lazy(() => Callback),
  message: v.optional(v.nullable(v.lazy(() => Message))),
  user_locale: v.optional(v.nullable(v.string())),
})

export const MessageCreatedUpdate: v.GenericSchema<unknown, T.MessageCreatedUpdate> = v.looseObject({
  update_type: v.literal("message_created"),
  timestamp: int64(),
  message: v.lazy(() => Message),
  user_locale: v.optional(v.nullable(v.string())),
})

export const MessageRemovedUpdate: v.GenericSchema<unknown, T.MessageRemovedUpdate> = v.looseObject({
  update_type: v.literal("message_removed"),
  timestamp: int64(),
  message_id: v.lazy(() => MessageId),
  chat_id: v.lazy(() => ChatId),
  user_id: v.lazy(() => UserId),
})

export const MessageEditedUpdate: v.GenericSchema<unknown, T.MessageEditedUpdate> = v.looseObject({
  update_type: v.literal("message_edited"),
  timestamp: int64(),
  message: v.lazy(() => Message),
})

export const CommentCreatedUpdate: v.GenericSchema<unknown, T.CommentCreatedUpdate> = v.looseObject({
  update_type: v.literal("comment_created"),
  timestamp: int64(),
  message: v.lazy(() => Message),
})

export const CommentRemovedUpdate: v.GenericSchema<unknown, T.CommentRemovedUpdate> = v.looseObject({
  update_type: v.literal("comment_removed"),
  timestamp: int64(),
  message_id: v.lazy(() => MessageId),
  chat_id: v.lazy(() => ChatId),
  user_id: v.lazy(() => UserId),
  post_id: v.lazy(() => MessageId),
})

export const CommentEditedUpdate: v.GenericSchema<unknown, T.CommentEditedUpdate> = v.looseObject({
  update_type: v.literal("comment_edited"),
  timestamp: int64(),
  message: v.lazy(() => Message),
})

export const BotAddedToChatUpdate: v.GenericSchema<unknown, T.BotAddedToChatUpdate> = v.looseObject({
  update_type: v.literal("bot_added"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  is_channel: v.boolean(),
})

export const BotRemovedFromChatUpdate: v.GenericSchema<unknown, T.BotRemovedFromChatUpdate> = v.looseObject({
  update_type: v.literal("bot_removed"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  is_channel: v.boolean(),
})

export const UserAddedToChatUpdate: v.GenericSchema<unknown, T.UserAddedToChatUpdate> = v.looseObject({
  update_type: v.literal("user_added"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  inviter_id: v.optional(v.nullable(v.lazy(() => UserId))),
  is_channel: v.boolean(),
})

export const UserRemovedFromChatUpdate: v.GenericSchema<unknown, T.UserRemovedFromChatUpdate> = v.looseObject({
  update_type: v.literal("user_removed"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  admin_id: v.optional(v.lazy(() => UserId)),
  is_channel: v.boolean(),
})

export const BotStartedUpdate: v.GenericSchema<unknown, T.BotStartedUpdate> = v.looseObject({
  update_type: v.literal("bot_started"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  payload: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(512)))),
  user_locale: v.optional(v.string()),
})

export const BotStoppedUpdate: v.GenericSchema<unknown, T.BotStoppedUpdate> = v.looseObject({
  update_type: v.literal("bot_stopped"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  user_locale: v.optional(v.string()),
})

export const DialogClearedUpdate: v.GenericSchema<unknown, T.DialogClearedUpdate> = v.looseObject({
  update_type: v.literal("dialog_cleared"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  user_locale: v.optional(v.string()),
})

export const DialogRemovedUpdate: v.GenericSchema<unknown, T.DialogRemovedUpdate> = v.looseObject({
  update_type: v.literal("dialog_removed"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  user_locale: v.optional(v.string()),
})

export const DialogMutedUpdate: v.GenericSchema<unknown, T.DialogMutedUpdate> = v.looseObject({
  update_type: v.literal("dialog_muted"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  muted_until: int64(),
  user_locale: v.optional(v.string()),
})

export const DialogUnmutedUpdate: v.GenericSchema<unknown, T.DialogUnmutedUpdate> = v.looseObject({
  update_type: v.literal("dialog_unmuted"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  user_locale: v.optional(v.string()),
})

export const ChatTitleChangedUpdate: v.GenericSchema<unknown, T.ChatTitleChangedUpdate> = v.looseObject({
  update_type: v.literal("chat_title_changed"),
  timestamp: int64(),
  chat_id: v.lazy(() => ChatId),
  user: v.lazy(() => User),
  title: v.string(),
})

export const BotAdminPermissionsChangedUpdate: v.GenericSchema<unknown, T.BotAdminPermissionsChangedUpdate> =
  v.looseObject({
    update_type: v.literal("bot_admin_permissions_changed"),
    timestamp: int64(),
    chat_id: v.lazy(() => ChatId),
    user_id: v.lazy(() => UserId),
    bot_id: v.lazy(() => UserId),
    is_channel: v.boolean(),
    is_admin: v.boolean(),
    permissions: v.optional(
      v.nullable(
        v.pipe(
          v.array(v.lazy(() => ChatAdminPermission)),
          v.check((items) => unique(items), "items must be unique"),
        ),
      ),
    ),
  })

export const ModifyMembersResult: v.GenericSchema<unknown, T.ModifyMembersResult> = v.looseObject({
  success: v.boolean(),
  message: v.optional(v.string()),
  failed_user_ids: v.optional(
    v.nullable(
      v.pipe(
        v.array(v.lazy(() => UserId)),
        v.check((items) => unique(items), "items must be unique"),
      ),
    ),
  ),
  failed_user_details: v.optional(v.nullable(v.array(v.lazy(() => FailedUserDetails)))),
})

export const FailedUserDetails: v.GenericSchema<unknown, T.FailedUserDetails> = v.looseObject({
  error_code: v.string(),
  user_ids: v.array(v.lazy(() => UserId)),
})

export const schemas = {
  Bigint,
  UserId,
  ChatId,
  MessageId,
  Url,
  SubscriptionUrl,
  User,
  UserWithPhoto,
  BotInfo,
  BotCommandsInfo,
  BotCommandsPatch,
  BotCommand,
  Chat,
  ChatType,
  ChatStatus,
  ChatList,
  ChatPatch,
  ChatMember,
  ChatAdminPermission,
  ChatMembersList,
  Image,
  Subscription,
  Recipient,
  Message,
  CommentMessage,
  MessageStat,
  MessageBody,
  CommentMessageBody,
  MessageList,
  CommentMessageList,
  TextFormat,
  NewMessageBody,
  NewCommentBody,
  NewMessageLink,
  LinkedMessage,
  CommentLinkedMessage,
  SendMessageResult,
  SendCommentResult,
  Attachment,
  PhotoAttachment,
  PhotoAttachmentPayload,
  VideoAttachment,
  VideoThumbnail,
  VideoUrls,
  VideoAttachmentDetails,
  AudioAttachment,
  FileAttachment,
  AttachmentPayload,
  MediaAttachmentPayload,
  FileAttachmentPayload,
  ContactAttachment,
  ContactAttachmentPayload,
  StickerAttachmentPayload,
  StickerAttachment,
  ShareAttachmentPayload,
  ShareAttachment,
  LocationAttachment,
  InlineKeyboardAttachment,
  Keyboard,
  Button,
  CallbackButton,
  LinkButton,
  MessageButton,
  RequestContactButton,
  RequestGeoLocationButton,
  OpenAppButton,
  ClipboardButton,
  MessageLinkType,
  AttachmentRequest,
  PhotoAttachmentRequest,
  PhotoAttachmentRequestPayload,
  PhotoToken,
  VideoAttachmentRequest,
  AudioAttachmentRequest,
  UploadedInfo,
  FileAttachmentRequest,
  UploadType,
  ContactAttachmentRequest,
  ContactAttachmentRequestPayload,
  StickerAttachmentRequest,
  StickerAttachmentRequestPayload,
  InlineKeyboardAttachmentRequest,
  InlineKeyboardAttachmentRequestPayload,
  LocationAttachmentRequest,
  ShareAttachmentRequest,
  MarkupElement,
  StrongMarkup,
  EmphasizedMarkup,
  MonospacedMarkup,
  LinkMarkup,
  StrikethroughMarkup,
  UnderlineMarkup,
  HeadingMarkup,
  UserMentionMarkup,
  HighlightedMarkup,
  QuoteMarkup,
  SubscriptionRequestBody,
  GetSubscriptionsResult,
  SimpleQueryResult,
  PinMessageBody,
  GetPinnedMessageResult,
  Callback,
  CallbackAnswer,
  ApiError,
  UploadEndpoint,
  UserIdsList,
  ActionRequestBody,
  ChatAdminsList,
  ChatAdmin,
  SenderAction,
  UpdateList,
  Update,
  MessageCallbackUpdate,
  MessageCreatedUpdate,
  MessageRemovedUpdate,
  MessageEditedUpdate,
  CommentCreatedUpdate,
  CommentRemovedUpdate,
  CommentEditedUpdate,
  BotAddedToChatUpdate,
  BotRemovedFromChatUpdate,
  UserAddedToChatUpdate,
  UserRemovedFromChatUpdate,
  BotStartedUpdate,
  BotStoppedUpdate,
  DialogClearedUpdate,
  DialogRemovedUpdate,
  DialogMutedUpdate,
  DialogUnmutedUpdate,
  ChatTitleChangedUpdate,
  BotAdminPermissionsChangedUpdate,
  ModifyMembersResult,
  FailedUserDetails,
} as const
