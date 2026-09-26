// GENERATED. DO NOT EDIT.
// Source: spec/bot/schema.yaml
// Run: pnpm bot:generate

/** 64-bit integer identifier */
export type Bigint = string

/** User identifier */
export type UserId = string

/** Chat identifier */
export type ChatId = string

/** Message identifier */
export type MessageId = string

/** URL string */
export type Url = string

/** URL of HTTPS-endpoint of your bot. Must starts with https:// */
export type SubscriptionUrl = string

/** User object */
export type User = {
  /** Users identifier */
  user_id: UserId
  /** Users first name */
  first_name: string
  /** Users last name */
  last_name?: string | null
  /** Unique public user name. Can be `null` if user is not accessible or it is not set */
  username?: string | null
  /** `true` if user is bot */
  is_bot: boolean
  /** Time of last user activity in Max (Unix timestamp in milliseconds). Can be outdated if user disabled its "online" status in settings */
  last_activity_time?: string | null
}

/** User with description and avatar URLs */
export type UserWithPhoto = {
  /** Users identifier */
  user_id: UserId
  /** Users first name */
  first_name: string
  /** Users last name */
  last_name?: string | null
  /** Unique public user name. Can be `null` if user is not accessible or it is not set */
  username?: string | null
  /** `true` if user is bot */
  is_bot: boolean
  /** Time of last user activity in Max (Unix timestamp in milliseconds). Can be outdated if user disabled its "online" status in settings */
  last_activity_time?: string | null
  /** User description. Can be `null` if user did not fill it out */
  description?: string | null
  /** URL of avatar */
  avatar_url?: string | null
  /** URL of avatar of a bigger size */
  full_avatar_url?: string | null
}

/** Bot information with commands and official status */
export type BotInfo = {
  /** Users identifier */
  user_id: UserId
  /** Users first name */
  first_name: string
  /** Users last name */
  last_name?: string | null
  /** Unique public user name. Can be `null` if user is not accessible or it is not set */
  username?: string | null
  /** `true` if user is bot */
  is_bot: boolean
  /** Time of last user activity in Max (Unix timestamp in milliseconds). Can be outdated if user disabled its "online" status in settings */
  last_activity_time?: string | null
  /** User description. Can be `null` if user did not fill it out */
  description?: string | null
  /** URL of avatar */
  avatar_url?: string | null
  /** URL of avatar of a bigger size */
  full_avatar_url?: string | null
  /** Commands supported by bot */
  commands?: Array<BotCommand> | null
}

/** Bot commands information */
export type BotCommandsInfo = {
  /** Commands supported by bot */
  commands?: Array<BotCommand> | null
}

/** Patch object for updating bot commands */
export type BotCommandsPatch = {
  /** Commands supported by bot */
  commands?: Array<BotCommand>
}

/** Bot command with name and description */
export type BotCommand = {
  /** Command name */
  name: string
  /** Optional command description */
  description?: string | null
}

/** Chat, channel or dialog object */
export type Chat = {
  /** Chats identifier */
  chat_id: ChatId
  /** Type of chat. One of: dialog, chat, channel */
  type: ChatType
  /** Chat status. One of: - active: bot is active member of chat - removed: bot was kicked - left: bot intentionally left chat - closed: chat was closed - suspended: bot was stopped by user. *Only for dialogs* */
  status: ChatStatus
  /** Visible title of chat. Can be null for dialogs */
  title?: string | null
  /** Icon of chat */
  icon?: Image | null
  /** Time of last event occurred in chat */
  last_event_time: string
  /** Number of people in chat. Always 2 for `dialog` chat type */
  participants_count: number
  /** Identifier of chat owner. Visible only for chat admins */
  owner_id?: UserId | null
  /** Participants in chat with time of last activity. Can be *null* when you request list of chats. Visible for chat admins only */
  participants?: Record<string, string> | null
  /** Is current chat publicly available. Always `false` for dialogs */
  is_public: boolean
  /** Link on chat */
  link?: string | null
  /** Chat description */
  description?: string | null
  /** Another user in conversation. For `dialog` type chats only */
  dialog_with_user?: UserWithPhoto | null
  /** Messages count in chat. Only for group chats and channels. **Not available** for dialogs */
  messages_count?: number | null
  /** Pinned message in chat or channel. Returned only when single chat is requested */
  pinned_message?: Message | null
}

/** Type of chat. Dialog (one-on-one), chat or channel */
export type ChatType = "dialog" | "chat" | "channel"

/** Chat status for current bot */
export type ChatStatus = "active" | "removed" | "left" | "closed" | "suspended"

/** Paginated list of chats */
export type ChatList = {
  /** List of requested chats */
  chats: Array<Chat>
  /** Reference to the next page of requested chats */
  marker?: string | null
}

/** Patch object for updating chat info */
export type ChatPatch = {
  icon?: PhotoAttachmentRequestPayload | null
  title?: string | null
  /** Chat description up to 16k characters long. Pass empty string to remove description */
  description?: string | null
  /** Identifier of message to be pinned in chat. In case you want to remove pin, use /unpin method */
  pin?: string | null
  /** By default, participants will be notified about change with system message in chat/channel */
  notify?: boolean | null
}

/** Chat or channel member with membership info */
export type ChatMember = {
  /** Users identifier */
  user_id: UserId
  /** Users first name */
  first_name: string
  /** Users last name */
  last_name?: string | null
  /** Unique public user name. Can be `null` if user is not accessible or it is not set */
  username?: string | null
  /** `true` if user is bot */
  is_bot: boolean
  /** Time of last user activity in Max (Unix timestamp in milliseconds). Can be outdated if user disabled its "online" status in settings */
  last_activity_time?: string | null
  /** User description. Can be `null` if user did not fill it out */
  description?: string | null
  /** URL of avatar */
  avatar_url?: string | null
  /** URL of avatar of a bigger size */
  full_avatar_url?: string | null
  /** User last activity time in chat or channel . Can be outdated for super chats and channels (equals to `join_time`) */
  last_access_time: string
  is_owner: boolean
  is_admin: boolean
  join_time: string
  /** Permissions in chat if member is admin. `null` otherwise */
  permissions?: Array<ChatAdminPermission> | null
  /** Alias in chat if member is admin. By default, `null` */
  alias?: string | null
}

/** Chat admin permissions */
export type ChatAdminPermission =
  | "read_all_messages"
  | "add_remove_members"
  | "add_admins"
  | "change_chat_info"
  | "pin_message"
  | "edit_link"
  | "write"
  | "edit"
  | "delete"
  | "can_call"
  | "view_stats"

/** Paginated list of chat members */
export type ChatMembersList = {
  /** Participants in chat with time of last activity */
  members: Array<ChatMember>
  /** Pointer to the next data page */
  marker?: string | null
}

/** Generic schema describing image object */
export type Image = {
  /** URL of image */
  url: string
}

/** Schema to describe WebHook subscription */
export type Subscription = {
  /** Webhook URL */
  url: string
  /** Unix-time when subscription was created */
  time: string
  /** Update types bot subscribed for */
  update_types?: Array<string> | null
}

/** New message recipient. Could be user, chat or channel */
export type Recipient = {
  /** Chat or channel identifier */
  chat_id?: ChatId | null
  /** Chat type */
  chat_type: ChatType
  /** User identifier, if message was sent to user */
  user_id?: UserId | null
  /** Post identifier for comments */
  post_id?: MessageId | null
}

/** Message in chat */
export type Message = {
  /** User who sent this message. Can be `null` if message has been posted on behalf of a channel */
  sender?: User | null
  /** Message recipient. Could be user, chat or channel */
  recipient: Recipient
  /** Unix-time when message was created */
  timestamp: string
  /** Forwarded or replied message */
  link?: LinkedMessage | null
  /** Body of created message. Text + attachments. Could be null if message contains only forwarded message */
  body: MessageBody
  /** Message statistics. Available only for channels in getMessages method context */
  stat?: MessageStat | null
  /** Message public URL. Can be `null` for dialogs or non-public chats/channels */
  url?: string | null
}

/** Comment message in chat. Unlike Message, has no public url and body has no attachments. */
export type CommentMessage = {
  /** User who sent this comment. Can be `null` if message has been posted on behalf of a channel */
  sender?: User | null
  /** Message recipient. Could be user or chat, for comments - only channel */
  recipient: Recipient
  /** Unix-time when message was created */
  timestamp: string
  /** Forwarded or replied message */
  link?: CommentLinkedMessage | null
  /** Body of created comment. Text only, no attachments. */
  body: CommentMessageBody
  /** Message statistics. Available only for channels in in getMessages method context */
  stat?: MessageStat | null
}

/** Message statistics */
export type MessageStat = {
  views: number
}

/** Schema representing body of message */
export type MessageBody = {
  /** Unique identifier of message */
  mid: MessageId
  /** Sequence identifier of message in chat */
  seq: string
  /** Message text */
  text?: string | null
  /** Message attachments. Could be one of `Attachment` type. See description of this schema */
  attachments?: Array<Attachment> | null
  /** Message text markup. See formatting section in https://dev.max.ru/docs-api for more info */
  markup?: Array<MarkupElement> | null
}

/** Schema representing body of a comment message. Unlike MessageBody, attachments are not allowed. */
export type CommentMessageBody = {
  /** Unique identifier of message */
  mid: MessageId
  /** Sequence identifier of message in chat */
  seq: string
  /** Message text */
  text?: string | null
  /** Message text markup. See Formatting section in https://dev.max.ru/docs-api for more info */
  markup?: Array<MarkupElement> | null
}

/** Paginated list of messages */
export type MessageList = {
  /** List of messages */
  messages: Array<Message>
}

/** Paginated list of comment messages */
export type CommentMessageList = {
  /** List of comment messages */
  messages: Array<CommentMessage>
}

/** Message text format */
export type TextFormat = "markdown" | "html"

/** Body of a new message to send */
export type NewMessageBody = {
  /** Message text */
  text?: string | null
  /** Message attachments. See `AttachmentRequest` and it's inheritors for full information */
  attachments?: Array<AttachmentRequest> | null
  /** Link to Message */
  link?: NewMessageLink | null
  /** If false, chat participants would not be notified */
  notify?: boolean
  /** If set, message text will be formatted according to given markup */
  format?: TextFormat | null
}

/** Body of a new comment to send. Unlike NewMessageBody, attachments are not allowed. */
export type NewCommentBody = {
  /** Message text */
  text?: string | null
  /** Link to Message */
  link?: NewMessageLink | null
  /** If set, message text will be formatted according to given markup */
  format?: TextFormat | null
}

/** Link to a message for reply or forward */
export type NewMessageLink = {
  /** Type of message link */
  type: MessageLinkType
  /** Message identifier of original message */
  mid: MessageId
}

/** Forwarded or replied message */
export type LinkedMessage = {
  /** Type of linked message */
  type: MessageLinkType
  /** User sent this message. Can be `null` if message has been posted on behalf of a channel */
  sender?: User | null
  /** Chat where message has been originally posted */
  chat_id?: ChatId
  message: MessageBody
}

/** Forwarded or replied comment. Unlike LinkedMessage, `message` is a CommentMessageBody (no attachments, as comments cannot have them) */
export type CommentLinkedMessage = {
  /** Type of linked message */
  type: MessageLinkType
  /** User sent this message. Can be `null` if message has been posted on behalf of a channel */
  sender?: User | null
  /** Chat where message has been originally posted */
  chat_id?: ChatId
  message: CommentMessageBody
}

/** Result of sending a message */
export type SendMessageResult = {
  message: Message
}

/** Result of sending a comment */
export type SendCommentResult = {
  message: CommentMessage
}

/** Generic schema representing message attachment */
export type Attachment =
  | PhotoAttachment
  | VideoAttachment
  | AudioAttachment
  | FileAttachment
  | StickerAttachment
  | ContactAttachment
  | InlineKeyboardAttachment
  | ShareAttachment
  | LocationAttachment

/** Image attachment */
export type PhotoAttachment = {
  type: "image"
  payload: PhotoAttachmentPayload
}

/** Payload of photo attachment containing image metadata */
export type PhotoAttachmentPayload = {
  /** Unique identifier of this image */
  photo_id: string
  token: string
  /** Image URL */
  url: string
}

/** Video attachment */
export type VideoAttachment = {
  type: "video"
  payload: MediaAttachmentPayload
  /** Video thumbnail */
  thumbnail?: VideoThumbnail | null
  /** Video width */
  width?: number | null
  /** Video height */
  height?: number | null
  /** Video duration in seconds */
  duration?: number | null
}

/** Video thumbnail image */
export type VideoThumbnail = {
  /** Image URL */
  url: string
}

/** Available video download and streaming URLs by resolution */
export type VideoUrls = {
  /** Video URL in 1080p resolution, if available */
  mp4_1080?: string | null
  /** Video URL in 720 resolution, if available */
  mp4_720?: string | null
  /** Video URL in 480 resolution, if available */
  mp4_480?: string | null
  /** Video URL in 360 resolution, if available */
  mp4_360?: string | null
  /** Video URL in 240 resolution, if available */
  mp4_240?: string | null
  /** Video URL in 144 resolution, if available */
  mp4_144?: string | null
  /** Live streaming URL, if available */
  hls?: string | null
}

/** Detailed information about video attachment including direct URLs */
export type VideoAttachmentDetails = {
  /** Video attachment token */
  token: string
  /** URLs to download or play video. Can be null if video is unavailable */
  urls?: VideoUrls | null
  /** Video thumbnail */
  thumbnail?: PhotoAttachmentPayload | null
  /** Video width */
  width: number
  /** Video height */
  height: number
  /** Video duration in seconds */
  duration: number
}

/** Audio attachment */
export type AudioAttachment = {
  type: "audio"
  payload: MediaAttachmentPayload
  /** Audio transcription */
  transcription?: string | null
}

/** File attachment */
export type FileAttachment = {
  type: "file"
  payload: FileAttachmentPayload
  /** Uploaded file name */
  filename: string
  /** File size in bytes */
  size: string
}

/** Base payload for message attachments containing media URL */
export type AttachmentPayload = {
  /** Media attachment URL. For video attachments use getVideoAttachmentDetails method to obtain direct links. */
  url: string
}

/** Payload for media (video/audio) attachments with reuse token */
export type MediaAttachmentPayload = {
  /** Media attachment URL. For video attachments use getVideoAttachmentDetails method to obtain direct links. */
  url: string
  /** Use `token` in case when you are trying to reuse the same attachment in other message */
  token: string
}

/** Payload for file attachments with reuse token */
export type FileAttachmentPayload = {
  /** Media attachment URL. For video attachments use getVideoAttachmentDetails method to obtain direct links. */
  url: string
  /** Use `token` in case when you are trying to reuse the same attachment in other message */
  token: string
}

/** Contact attachment */
export type ContactAttachment = {
  type: "contact"
  payload: ContactAttachmentPayload
}

/** Payload of contact attachment containing user contact info */
export type ContactAttachmentPayload = {
  /** User info in VCF format */
  vcf_info?: string | null
  /** User info in VCF format hash */
  hash?: string | null
  /** User info */
  max_info?: User | null
}

/** Payload of sticker attachment */
export type StickerAttachmentPayload = {
  /** Media attachment URL. For video attachments use getVideoAttachmentDetails method to obtain direct links. */
  url: string
  /** Sticker identifier */
  code: string
}

/** Sticker attachment */
export type StickerAttachment = {
  type: "sticker"
  payload: StickerAttachmentPayload
  /** Sticker width */
  width: number
  /** Sticker height */
  height: number
}

/** Payload of ShareAttachmentRequest */
export type ShareAttachmentPayload = {
  /** URL attached to message as media preview */
  url?: string | null
  /** Attachment token */
  token?: string | null
}

/** Link preview attachment with media */
export type ShareAttachment = {
  type: "share"
  payload: ShareAttachmentPayload
  /** Link preview title */
  title?: string | null
  /** Link preview description */
  description?: string | null
  /** Link preview image */
  image_url?: string | null
}

/** Geographic location attachment */
export type LocationAttachment = {
  type: "location"
  latitude: number
  longitude: number
}

/** Buttons in messages */
export type InlineKeyboardAttachment = {
  type: "inline_keyboard"
  payload: Keyboard
}

/** Keyboard is two-dimension array of buttons */
export type Keyboard = {
  buttons: Array<Array<Button>>
}

/** Inline keyboard button */
export type Button =
  | CallbackButton
  | LinkButton
  | RequestGeoLocationButton
  | RequestContactButton
  | MessageButton
  | OpenAppButton
  | ClipboardButton

/** After pressing this type of button client sends to server payload it contains */
export type CallbackButton = {
  type: "callback"
  /** Visible text of button */
  text: string
  /** Button payload */
  payload: string
}

/** After pressing this type of button user follows the link it contains */
export type LinkButton = {
  type: "link"
  /** Visible text of button */
  text: string
  url: string
}

/** After pressing this type of button it sends message from user in chat */
export type MessageButton = {
  type: "message"
  /** Visible text of button */
  text: string
}

/** After pressing this type of button client sends new message with attachment of current user contact */
export type RequestContactButton = {
  type: "request_contact"
  /** Visible text of button */
  text: string
}

/** After pressing this type of button client sends new message with attachment of current user geo location */
export type RequestGeoLocationButton = {
  type: "request_geo_location"
  /** Visible text of button */
  text: string
  /** If *true*, sends location without asking user's confirmation */
  quick?: boolean
}

/** After pressing this type of button client opens mini app */
export type OpenAppButton = {
  type: "open_app"
  /** Visible text of button */
  text: string
  /** Button payload */
  payload?: string | null
  /** Unique public name of the bot wired to the mini app */
  web_app: string
  /** Unique identifier of the bot wired to the mini app */
  contact_id?: UserId | null
}

/** After pressing this type of button client copies payload data to clipboard */
export type ClipboardButton = {
  type: "clipboard"
  /** Visible text of button */
  text: string
  /** Button payload */
  payload: string
}

/** Type of linked message */
export type MessageLinkType = "forward" | "reply"

/** Request to attach some data to message */
export type AttachmentRequest =
  | PhotoAttachmentRequest
  | VideoAttachmentRequest
  | AudioAttachmentRequest
  | FileAttachmentRequest
  | StickerAttachmentRequest
  | ContactAttachmentRequest
  | InlineKeyboardAttachmentRequest
  | LocationAttachmentRequest
  | ShareAttachmentRequest

/** Request to attach image to message */
export type PhotoAttachmentRequest = {
  type: "image"
  payload: PhotoAttachmentRequestPayload
}

/** Request to attach image. All fields are mutually exclusive */
export type PhotoAttachmentRequestPayload = {
  /** Any external image URL you want to attach */
  url?: string | null
  /** Token of any existing attachment */
  token?: string | null
  /** Tokens were obtained after uploading images */
  photos?: Record<string, PhotoToken> | null
}

/** Token representing an uploaded image */
export type PhotoToken = {
  /** Encoded information of uploaded image */
  token: string
}

/** Request to attach video to message */
export type VideoAttachmentRequest = {
  type: "video"
  payload: UploadedInfo
}

/** Request to attach audio to message. MUST be the only attachment in message */
export type AudioAttachmentRequest = {
  type: "audio"
  payload: UploadedInfo
}

/** This is information you will receive as soon as audio/video is uploaded */
export type UploadedInfo = {
  /** Token is unique uploaded media identifier */
  token?: string
}

/** Request to attach file to message. MUST be the only attachment in message */
export type FileAttachmentRequest = {
  type: "file"
  payload: UploadedInfo
}

/** Type of file uploading */
export type UploadType = "image" | "video" | "audio" | "file"

/** Request to attach contact card to message. MUST be the only attachment in message */
export type ContactAttachmentRequest = {
  type: "contact"
  payload: ContactAttachmentRequestPayload
}

/** Payload for contact attachment request */
export type ContactAttachmentRequestPayload = {
  /** Contact name */
  name?: string | null
  /** Contact identifier if it is registered Max user */
  contact_id?: UserId | null
  /** Full information about contact in VCF format */
  vcf_info?: string | null
  /** Contact phone in VCF format */
  vcf_phone?: string | null
}

/** Request to attach sticker. MUST be the only attachment request in message */
export type StickerAttachmentRequest = {
  type: "sticker"
  payload: StickerAttachmentRequestPayload
}

/** Payload for sticker attachment request */
export type StickerAttachmentRequestPayload = {
  /** Sticker code */
  code: string
}

/** Request to attach keyboard to message */
export type InlineKeyboardAttachmentRequest = {
  type: "inline_keyboard"
  payload: InlineKeyboardAttachmentRequestPayload
}

/** Payload for inline keyboard attachment request */
export type InlineKeyboardAttachmentRequestPayload = {
  /** Two-dimensional array of buttons */
  buttons: Array<Array<Button>>
}

/** Request to attach geographic location to message */
export type LocationAttachmentRequest = {
  type: "location"
  latitude: number
  longitude: number
}

/** Request to attach media preview of any external URL */
export type ShareAttachmentRequest = {
  type: "share"
  payload: ShareAttachmentPayload
}

/** Base type for text markup (formatting) elements */
export type MarkupElement =
  | StrongMarkup
  | EmphasizedMarkup
  | MonospacedMarkup
  | LinkMarkup
  | StrikethroughMarkup
  | UnderlineMarkup
  | UserMentionMarkup
  | HeadingMarkup
  | HighlightedMarkup
  | QuoteMarkup

/** Represents **bold** in text */
export type StrongMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "strong"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents *italic* in text */
export type EmphasizedMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "emphasized"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents `monospaced` or ```code``` block in text */
export type MonospacedMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "monospaced"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents link in text */
export type LinkMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "link"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
  /** Link's URL */
  url: string
}

/** Represents ~strikethrough~ block in text */
export type StrikethroughMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "strikethrough"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents ++underlined++ part of the text */
export type UnderlineMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "underline"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents header part of the text */
export type HeadingMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "heading"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents user mention in text. Mention can be both by user's username or ID if user doesn't have username */
export type UserMentionMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "user_mention"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
  /** `@username` of mentioned user */
  user_link?: string | null
  /** Identifier of mentioned user without username */
  user_id?: UserId | null
}

/** Represents a highlighted piece of text */
export type HighlightedMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "highlighted"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Represents quote block in text */
export type QuoteMarkup = {
  /** Type of the markup element. Can be **strong**, *emphasized*, ~strikethrough~, ++underline++, `monospaced`, highlighted, link, quote, header or user_mention */
  type: "quote"
  /** Element start index (zero-based) in text */
  from: number
  /** Length of the markup element */
  length: number
}

/** Request to set up WebHook subscription */
export type SubscriptionRequestBody = {
  url: SubscriptionUrl
  /** A secret to be sent in a header “X-Max-Bot-Api-Secret” in every webhook request, 5-256 characters. Only characters A-Z, a-z, 0-9, _ and - are allowed. The header is useful to ensure that the request comes from a webhook set by you. */
  secret?: string
  /** List of update types your bot want to receive. See `Update` object for a complete list of types */
  update_types?: Array<string>
}

/** List of all WebHook subscriptions */
export type GetSubscriptionsResult = {
  /** Current subscriptions */
  subscriptions: Array<Subscription>
}

/** Simple response to request */
export type SimpleQueryResult = {
  /** `true` if request was successful. `false` otherwise */
  success: boolean
  /** Explanatory message if the result is not successful */
  message?: string
}

/** Request body for pinning a message in chat */
export type PinMessageBody = {
  /** Identifier of message to be pinned in chat */
  message_id: MessageId
  /** If `true`, participants will be notified with system message in chat/channel */
  notify?: boolean | null
}

/** Result of getting pinned message in chat */
export type GetPinnedMessageResult = {
  /** Pinned message. Can be `null` if no message pinned in chat */
  message?: Message | null
}

/** Object sent to bot when user presses button */
export type Callback = {
  /** Unix-time when user pressed the button */
  timestamp: string
  /** Current keyboard identifier */
  callback_id: string
  /** Button payload */
  payload?: string
  /** User pressed the button */
  user: User
}

/** Send this object when your bot wants to react to when a button is pressed */
export type CallbackAnswer = {
  /** Fill this if you want to modify current message */
  message?: NewMessageBody | null
  /** Fill this if you just want to send one-time notification to user */
  notification?: string | null
}

/** Server returns this if there was an exception to your request */
export type ApiError = {
  /** Error */
  error?: string
  /** Error code */
  code: string
  /** Human-readable description */
  message: string
}

/** Endpoint you should upload to your binaries */
export type UploadEndpoint = {
  /** URL to upload */
  url: string
  /** Video or audio token for send message */
  token?: string | null
}

/** List of user identifiers */
export type UserIdsList = {
  user_ids: Array<UserId>
}

/** Request body for sending action to chat */
export type ActionRequestBody = {
  action: SenderAction
}

/** List of chat administrators with permissions */
export type ChatAdminsList = {
  admins: Array<ChatAdmin>
}

/** Administrator id with permissions */
export type ChatAdmin = {
  user_id: UserId
  permissions: Array<ChatAdminPermission>
  /** Alias of the admin in chat. By default, `null` */
  alias?: string | null
}

/** Different actions to send to chat members */
export type SenderAction =
  | "typing_on"
  | "sending_photo"
  | "sending_video"
  | "sending_audio"
  | "sending_file"
  | "mark_seen"

/** List of all updates in chats your bot participated in */
export type UpdateList = {
  /** Page of updates */
  updates: Array<Update>
  /** Pointer to the next data page */
  marker?: string | null
}

/** `Update` object represents different types of events that happened in chat. See its inheritors */
export type Update =
  | MessageCreatedUpdate
  | MessageCallbackUpdate
  | MessageEditedUpdate
  | MessageRemovedUpdate
  | CommentCreatedUpdate
  | CommentEditedUpdate
  | CommentRemovedUpdate
  | BotAddedToChatUpdate
  | BotRemovedFromChatUpdate
  | UserAddedToChatUpdate
  | UserRemovedFromChatUpdate
  | BotStartedUpdate
  | BotStoppedUpdate
  | DialogClearedUpdate
  | DialogRemovedUpdate
  | DialogMutedUpdate
  | DialogUnmutedUpdate
  | ChatTitleChangedUpdate
  | BotAdminPermissionsChangedUpdate

/** You will get this `update` as soon as user presses button */
export type MessageCallbackUpdate = {
  update_type: "message_callback"
  /** Unix-time when event has occurred */
  timestamp: string
  callback: Callback
  /** Original message containing inline keyboard. Can be `null` in case it had been deleted by the moment a bot got this update */
  message?: Message | null
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string | null
}

/** You will get this `update` as soon as message is created. In group chats bot receives this update only if it is administrator with `read_all_messages` permission */
export type MessageCreatedUpdate = {
  update_type: "message_created"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Newly created message */
  message: Message
  /** Current user locale in IETF BCP 47 format. Available only in dialogs */
  user_locale?: string | null
}

/** You will get this `update` as soon as message is removed. In group chats bot receives this update only if it is administrator with `read_all_messages` permission */
export type MessageRemovedUpdate = {
  update_type: "message_removed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Identifier of removed message */
  message_id: MessageId
  /** Chat identifier where message has been deleted */
  chat_id: ChatId
  /** User who deleted this message */
  user_id: UserId
}

/** You will get this `update` as soon as message is edited. In group chats bot receives this update only if it is administrator with `read_all_messages` permission */
export type MessageEditedUpdate = {
  update_type: "message_edited"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Edited message */
  message: Message
}

/** You will get this `update` as soon as comment is created. Bot receives this update only if it is administrator of the channel with `read_all_messages` permission */
export type CommentCreatedUpdate = {
  update_type: "comment_created"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Newly created comment */
  message: Message
}

/** You will get this `update` as soon as comment is removed. Bot receives this update only if it is administrator of the channel with `read_all_messages` permission */
export type CommentRemovedUpdate = {
  update_type: "comment_removed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Identifier of removed comment */
  message_id: MessageId
  /** Chat identifier where comment has been deleted */
  chat_id: ChatId
  /** User who deleted this comment */
  user_id: UserId
  /** Post identifier */
  post_id: MessageId
}

/** You will get this `update` as soon as comment is edited. Bot receives this update only if it is administrator of the channel with `read_all_messages` permission */
export type CommentEditedUpdate = {
  update_type: "comment_edited"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Edited comment */
  message: Message
}

/** You will receive this update when bot has been added to chat */
export type BotAddedToChatUpdate = {
  update_type: "bot_added"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat id where bot was added */
  chat_id: ChatId
  /** User who added bot to chat */
  user: User
  /** Indicates whether bot has been added to channel or not */
  is_channel: boolean
}

/** You will receive this update when bot has been removed from chat */
export type BotRemovedFromChatUpdate = {
  update_type: "bot_removed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat identifier bot removed from */
  chat_id: ChatId
  /** User who removed bot from chat */
  user: User
  /** Indicates whether bot has been removed from channel or not */
  is_channel: boolean
}

/** You will receive this update when user has been added to chat where bot is administrator with `read_all_messages` permission */
export type UserAddedToChatUpdate = {
  update_type: "user_added"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat identifier where event has occurred */
  chat_id: ChatId
  /** User added to chat */
  user: User
  /** User who added user to chat. Can be `null` in case when user joined chat by link */
  inviter_id?: UserId | null
  /** Indicates whether user has been added to channel or not */
  is_channel: boolean
}

/** You will receive this update when user has been removed from chat where bot is administrator with `read_all_messages` permission */
export type UserRemovedFromChatUpdate = {
  update_type: "user_removed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat identifier where event has occurred */
  chat_id: ChatId
  /** User removed from chat */
  user: User
  /** Administrator who removed user from chat. Can be `null` in case when user left chat */
  admin_id?: UserId
  /** Indicates whether user has been removed from channel or not */
  is_channel: boolean
}

/** Bot gets this type of update as soon as user pressed `Start` button */
export type BotStartedUpdate = {
  update_type: "bot_started"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User pressed the 'Start' button */
  user: User
  /** Additional data from deep-link passed on bot startup */
  payload?: string | null
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as bot has been stopped */
export type BotStoppedUpdate = {
  update_type: "bot_stopped"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User who stopped the bot */
  user: User
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as dialog history has been cleared */
export type DialogClearedUpdate = {
  update_type: "dialog_cleared"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User who cleared the dialog */
  user: User
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as dialog has been removed */
export type DialogRemovedUpdate = {
  update_type: "dialog_removed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User who removed the dialog */
  user: User
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as dialog has been muted */
export type DialogMutedUpdate = {
  update_type: "dialog_muted"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User who muted the dialog */
  user: User
  /** Unix-time until which the dialog was muted */
  muted_until: string
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as dialog has been unmuted */
export type DialogUnmutedUpdate = {
  update_type: "dialog_unmuted"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Dialog identifier where event has occurred */
  chat_id: ChatId
  /** User who unmuted the dialog */
  user: User
  /** Current user locale in IETF BCP 47 format */
  user_locale?: string
}

/** Bot gets this type of update as soon as title has been changed in chat */
export type ChatTitleChangedUpdate = {
  update_type: "chat_title_changed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat identifier where event has occurred */
  chat_id: ChatId
  /** User who changed title */
  user: User
  /** New title */
  title: string
}

/** Bot will get this update when bot admin permissions changed */
export type BotAdminPermissionsChangedUpdate = {
  update_type: "bot_admin_permissions_changed"
  /** Unix-time when event has occurred */
  timestamp: string
  /** Chat identifier where event has occurred */
  chat_id: ChatId
  /** User or bot who changed bot admin permissions */
  user_id: UserId
  /** Bot that admin permissions changed */
  bot_id: UserId
  /** Indicates whether bot admin permissions has been changed in channel or not */
  is_channel: boolean
  /** Indicates whether bot is admin in chat/channel or not */
  is_admin: boolean
  permissions?: Array<ChatAdminPermission> | null
}

/** Result of members list modification request */
export type ModifyMembersResult = {
  /** `true` if request was successful. `false` otherwise */
  success: boolean
  /** Explanatory message if the result is not successful */
  message?: string
  /** List of user IDs failed to add or delete */
  failed_user_ids?: Array<UserId> | null
  failed_user_details?: Array<FailedUserDetails> | null
}

/** Detailed info about why a user cannot be added to the chat. */
export type FailedUserDetails = {
  /** Code add.participant.privacy - Privacy errors while add participants. Code add.participant.not.found - Users to add not found */
  error_code: string
  /** List of user IDs failed to add */
  user_ids: Array<UserId>
}
