// GENERATED. DO NOT EDIT.
// Source: spec/bot/schema.yaml
// Run: pnpm bot:generate

import type { ManifestOperation } from "@leemour/cli-core/codegen"

export const operations: readonly ManifestOperation[] = [
  {
    id: "getMyInfo",
    command: "get-my-info",
    binding: {
      kind: "http",
      method: "GET",
      path: "/me",
    },
    effect: "read",
    summary: "Get current bot info",
    description:
      "Returns info about current bot. Current bot can be identified by access token. Method returns bot identifier, name and avatar (if any)",
    tags: ["bots"],
    parameters: [],
    response: {
      confidence: "contract",
      schema: "BotInfo",
    },
  },
  {
    id: "editMyCommands",
    command: "edit-my-commands",
    binding: {
      kind: "http",
      method: "PATCH",
      path: "/me/commands",
    },
    effect: "write",
    summary: "Edit current bot commands",
    description: "Edits current bot Commands.",
    tags: ["bots"],
    parameters: [],
    request: {
      required: true,
      confidence: "contract",
      schema: "BotCommandsPatch",
    },
    response: {
      confidence: "contract",
      schema: "BotCommandsInfo",
    },
  },
  {
    id: "getChat",
    command: "get-chat",
    binding: {
      kind: "http",
      method: "GET",
      path: "/chats/{chatId}",
    },
    effect: "read",
    summary: "Get chat",
    description: "Returns info about chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Requested chat or channel identifier",
      },
    ],
    response: {
      confidence: "contract",
      schema: "Chat",
    },
  },
  {
    id: "editChat",
    command: "edit-chat",
    binding: {
      kind: "http",
      method: "PATCH",
      path: "/chats/{chatId}",
    },
    effect: "write",
    summary: "Edit chat or channel info",
    description: "Edits chat or channel info: title, icon, etc…",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "ChatPatch",
    },
    response: {
      confidence: "contract",
      schema: "Chat",
    },
  },
  {
    id: "sendAction",
    command: "send-action",
    binding: {
      kind: "http",
      method: "POST",
      path: "/chats/{chatId}/actions",
    },
    effect: "write",
    summary: "Send action",
    description: "Send bot action to chat.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "ActionRequestBody",
    },
  },
  {
    id: "getPinnedMessage",
    command: "get-pinned-message",
    binding: {
      kind: "http",
      method: "GET",
      path: "/chats/{chatId}/pin",
    },
    effect: "read",
    summary: "Get pinned message",
    description: "Get pinned message in chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat identifier to get its pinned message",
      },
    ],
    response: {
      confidence: "contract",
      schema: "GetPinnedMessageResult",
    },
  },
  {
    id: "pinMessage",
    command: "pin-message",
    binding: {
      kind: "http",
      method: "PUT",
      path: "/chats/{chatId}/pin",
    },
    effect: "write",
    summary: "Pin message",
    description: "Pins message in chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat identifier where message should be pinned",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "PinMessageBody",
    },
  },
  {
    id: "unpinMessage",
    command: "unpin-message",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/chats/{chatId}/pin",
    },
    effect: "write",
    summary: "Unpin message",
    description: "Unpins message in chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat identifier to remove pinned message",
      },
    ],
  },
  {
    id: "getMembership",
    command: "get-membership",
    binding: {
      kind: "http",
      method: "GET",
      path: "/chats/{chatId}/members/me",
    },
    effect: "read",
    summary: "Get chat or channel membership",
    description: "Returns chat or channel  membership info for current bot",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
    ],
    response: {
      confidence: "contract",
      schema: "ChatMember",
    },
  },
  {
    id: "leaveChat",
    command: "leave-chat",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/chats/{chatId}/members/me",
    },
    effect: "destructive",
    summary: "Leave chat",
    description: "Removes bot from chat or channel members.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
    ],
  },
  {
    id: "getAdmins",
    command: "get-admins",
    binding: {
      kind: "http",
      method: "GET",
      path: "/chats/{chatId}/members/admins",
    },
    effect: "read",
    summary: "Get chat or channel admins",
    description:
      "Returns all chat or channel administrators. Bot must be **administrator** in requested chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
    ],
    response: {
      confidence: "contract",
      schema: "ChatMembersList",
    },
  },
  {
    id: "postAdmins",
    command: "post-admins",
    binding: {
      kind: "http",
      method: "POST",
      path: "/chats/{chatId}/members/admins",
    },
    effect: "write",
    summary: "Set chat or channel admins",
    description: "Returns true if all administrators added. Additional permissions may require",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "ChatAdminsList",
    },
  },
  {
    id: "deleteAdmins",
    command: "delete-admins",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/chats/{chatId}/members/admins/{userId}",
    },
    effect: "write",
    summary: "Revoke admin rights",
    description:
      "Revokes admin rights from a user in the chat or channel by removing their administrative privileges. Additional permissions may require.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
      {
        name: "userId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "UserId",
        },
        description: "User identifier",
      },
    ],
  },
  {
    id: "getMembers",
    command: "get-members",
    binding: {
      kind: "http",
      method: "GET",
      path: "/chats/{chatId}/members",
    },
    effect: "read",
    summary: "Get members",
    description: "Returns users participated in chat or channel.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
      {
        name: "user_ids",
        in: "query",
        required: false,
        schema: {
          nullable: true,
          type: "array",
          items: {
            type: "ref",
            ref: "UserId",
          },
          uniqueItems: true,
        },
        description:
          "Comma-separated list of users identifiers to get their membership. When this parameter is passed, both `count` and `marker` are ignored",
      },
      {
        name: "marker",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int64",
        },
        description: "Marker",
      },
      {
        name: "count",
        in: "query",
        required: false,
        schema: {
          default: 20,
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
        description: "Count",
      },
    ],
    response: {
      confidence: "contract",
      schema: "ChatMembersList",
    },
  },
  {
    id: "addMembers",
    command: "add-members",
    binding: {
      kind: "http",
      method: "POST",
      path: "/chats/{chatId}/members",
    },
    effect: "write",
    summary: "Add members",
    description: "Adds members to chat. Additional permissions may require.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "UserIdsList",
    },
    response: {
      confidence: "contract",
      schema: "ModifyMembersResult",
    },
  },
  {
    id: "removeMember",
    command: "remove-member",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/chats/{chatId}/members",
    },
    effect: "write",
    summary: "Remove member",
    description: "Removes member from chat or channel. Additional permissions may require.",
    tags: ["chats"],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier",
      },
      {
        name: "user_id",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "UserId",
        },
        description: "User id to remove from chat or channel",
      },
      {
        name: "block",
        in: "query",
        required: false,
        schema: {
          default: false,
          type: "boolean",
        },
        description:
          "Set to `true` if user should be blocked in chat.\nApplicable only for chats that have public or private link. Ignored otherwise",
      },
    ],
  },
  {
    id: "getSubscriptions",
    command: "get-subscriptions",
    binding: {
      kind: "http",
      method: "GET",
      path: "/subscriptions",
    },
    effect: "read",
    summary: "Get subscriptions",
    description: "In case your bot gets data via WebHook, the method returns list of all subscriptions",
    tags: ["subscriptions"],
    parameters: [],
    response: {
      confidence: "contract",
      schema: "GetSubscriptionsResult",
    },
  },
  {
    id: "subscribe",
    command: "subscribe",
    binding: {
      kind: "http",
      method: "POST",
      path: "/subscriptions",
    },
    effect: "write",
    summary: "Subscribe",
    description:
      "Subscribes bot to receive updates via WebHook. After calling this method, the bot will receive notifications about new events in chat rooms at the specified URL.\n\nYour server **must** be listening on port **443**",
    tags: ["subscriptions"],
    parameters: [],
    request: {
      required: true,
      confidence: "contract",
      schema: "SubscriptionRequestBody",
    },
  },
  {
    id: "unsubscribe",
    command: "unsubscribe",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/subscriptions",
    },
    effect: "write",
    summary: "Unsubscribe",
    description:
      "Unsubscribes bot from receiving updates via WebHook. After calling the method, the bot stops receiving notifications about new events. Notification via the long-poll API becomes available for the bot. Receiving updates via Long Polling is limited in speed and event retention time — this method is not suitable for production environments. We recommend using Webhook at all stages of work",
    tags: ["subscriptions"],
    parameters: [
      {
        name: "url",
        in: "query",
        required: true,
        schema: {
          type: "string",
        },
        description: "URL to remove from WebHook subscriptions",
      },
    ],
  },
  {
    id: "getUploadUrl",
    command: "get-upload-url",
    binding: {
      kind: "http",
      method: "POST",
      path: "/uploads",
    },
    effect: "write",
    summary: "Get upload URL",
    description:
      'Returns the URL for the subsequent file upload.\n\nFor example, you can upload it via curl:\n\n```curl -i -X POST\n  -H "Content-Type: multipart/form-data"\n  -F "data=@movie.mp4" "%UPLOAD_URL%"```\n\nTwo types of an upload are supported:\n- single request upload (multipart request)\n- and resumable upload.\n\n##### Multipart upload\nThis type of upload is a simpler one but it is less\nreliable and agile. If a `Content-Type`: multipart/form-data header is passed in a request our service indicates\nupload type as a simple single request upload.\n\nThis type of an upload has some restrictions: \n\n- image — available formats: JPG, JPEG, PNG, GIF, TIFF, BMP, HEIC; maximum size for a single image: up to 50 MB AND no more than 7680 x 7680 px — both criteria must be met. For example, you cannot upload an image that is 55 MB and has dimensions of 7600 x 7600 px.\n- video — available formats: MP4, MOV, MKV, WEBM; maximum size for a single video: up to 250 MB\n- audio — available formats: MP3, WAV, M4A, and others, maximum size for a single audio file: up to 256 MB OR duration of no more than 60 minutes — both criteria must be met. For example, you cannot send an audio file that is 250 MB and 70 minutes long.\n- file — available formats: TXT, DOC, PDF, and other common formats, maximum size for a single file: up to 4 GB\n- type=photo parameter is no longer supported. If you used type=photo in previously created integrations, please replace it with type=image\n- Only one mediafile per request can be uploaded\n- No possibility to restart stopped / failed upload\n\n##### Resumable upload\nIf `Content-Type` header value is not equal to `multipart/form-data` our service indicated upload type\nas a resumable upload.\nWith a `Content-Range` header current file chunk range and complete file size\ncan be passed. If a network error has happened or upload was stopped you can continue to upload a file from\nthe last successfully uploaded file chunk. You can request the last known byte of uploaded file from server\nand continue to upload a file.\n\n##### Get upload status\nTo GET an upload status you simply need to perform HTTPS-GET request to a file upload URL.\nOur service will respond with current upload status,\ncomplete file size and last known uploaded byte. This data can be used to complete stopped upload\nif something went wrong. If `REQUESTED_RANGE_NOT_SATISFIABLE` or `INTERNAL_SERVER_ERROR` status was returned\nit is a good point to try to restart an upload',
    tags: ["upload"],
    parameters: [
      {
        name: "type",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "UploadType",
        },
        description: "Uploaded file type: image, audio, video, file",
      },
    ],
    response: {
      confidence: "contract",
      schema: "UploadEndpoint",
    },
  },
  {
    id: "getMessages",
    command: "get-messages",
    binding: {
      kind: "http",
      method: "GET",
      path: "/messages",
    },
    effect: "read",
    summary: "Get messages",
    description:
      "Returns messages in chat or channel: result page and marker referencing to the next page. Messages traversed in reverse direction so the latest message in chat will be first in result array. Therefore if you use `from` and `to` parameters, `to` must be **less than** `from`",
    tags: ["messages"],
    parameters: [
      {
        name: "chat_id",
        in: "query",
        required: false,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Chat or channel identifier to get messages in chat or channel",
      },
      {
        name: "message_ids",
        in: "query",
        required: false,
        schema: {
          nullable: true,
          type: "array",
          items: {
            type: "string",
          },
          uniqueItems: true,
        },
        description: "Comma-separated list of message ids to get",
      },
      {
        name: "from",
        in: "query",
        required: false,
        schema: {
          type: "ref",
          ref: "bigint",
        },
        description: "Start time for requested messages - use after instead",
      },
      {
        name: "to",
        in: "query",
        required: false,
        schema: {
          type: "ref",
          ref: "bigint",
        },
        description: "End time for requested messages  - use before instead",
      },
      {
        name: "before",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int64",
          minimum: 0,
        },
        description: "Messages before timestamp",
      },
      {
        name: "after",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int64",
          minimum: 0,
        },
        description: "Messages after timestamp",
      },
      {
        name: "count",
        in: "query",
        required: false,
        schema: {
          default: 50,
          type: "integer",
          format: "int32",
          minimum: 1,
          maximum: 100,
        },
        description: "Maximum amount of messages in response",
      },
    ],
    response: {
      confidence: "contract",
      schema: "MessageList",
    },
  },
  {
    id: "sendMessage",
    command: "send-message",
    binding: {
      kind: "http",
      method: "POST",
      path: "/messages",
    },
    effect: "write",
    summary: "Send message",
    description:
      'Sends a message to a chat, channel or dialog. \nAs a result for this method new message identifier returns.\nIn the case of a channel, it returns an error if you pass notify=false\n### Attaching media\nAttaching media to messages is a three-step process.\n\nAt first step, you should obtain a URL to upload your media files.\n\nAt the second, you should upload binary of appropriate format to URL you obtained at the previous step. See [upload section](https://dev.max.ru/docs-api/methods/POST/uploads) in docs for details.\n\nFinally, if the upload process was successful, you will receive JSON-object in a response body.  Use this object to create attachment. Construct an object with two properties:\n- `type` with the value set to appropriate media type\n- and `payload` filled with the JSON you\'ve got.\n\nFor example, you can attach a video to message this way:\n\n1. Get URL to upload. Execute following:\n```shell\ncurl -X POST \'https://platform-api2.max.ru/uploads?type=video\' -H \'Authorization: %access_token%\' \n```\nAs the result it will return URL for the next step.\n```json\n{\n    "url": "http://omub.okcdn.ru/upload.do…" \n}\n```\n\n2. Use this url to upload your binary:\n```shell\ncurl -i -X POST\n  -H "Content-Type: multipart/form-data"\n  -F "data=@movie.mp4" "http://omub.okcdn.ru/upload.do…" \n```\nAs the result it will return JSON you can attach to message:\n```json\n  {\n    "token": "_3Rarhcf1PtlMXy8jpgie8Ai_KARnVFYNQTtmIRWNh4"\n  }\n```\n3. Send message with attach:\n```json\n{\n    "text": "Message with video",\n    "attachments": [\n        {\n            "type": "video",\n            "payload": {\n                "token": "_3Rarhcf1PtlMXy8jpgie8Ai_KARnVFYNQTtmIRWNh4"\n            }\n        }\n    ]\n}\n```\n\n**Important notice**:\n\nIt may take time for the server to process your file (audio/video or any binary).\nWhile a file is not processed you can\'t attach it. It means the last step will fail with `400` error.\nTry to send a message again until you\'ll get a successful result.',
    tags: ["messages"],
    parameters: [
      {
        name: "user_id",
        in: "query",
        required: false,
        schema: {
          type: "ref",
          ref: "UserId",
        },
        description: "Fill this parameter if you want to send message to user",
      },
      {
        name: "chat_id",
        in: "query",
        required: false,
        schema: {
          type: "ref",
          ref: "ChatId",
        },
        description: "Fill this if you send message to chat or channel",
      },
      {
        name: "disable_link_preview",
        in: "query",
        required: false,
        schema: {
          default: false,
          type: "boolean",
        },
        description: "If `false`, server will not generate media preview for links in text",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "NewMessageBody",
    },
    response: {
      confidence: "contract",
      schema: "SendMessageResult",
    },
  },
  {
    id: "editMessage",
    command: "edit-message",
    binding: {
      kind: "http",
      method: "PUT",
      path: "/messages",
    },
    effect: "write",
    summary: "Edit message",
    description:
      "Updated message should be sent as `NewMessageBody` in a request body. In case `attachments` field is `null`, the current message attachments won’t be changed. In case of sending an empty list in this field, all attachments will be deleted.",
    tags: ["messages"],
    parameters: [
      {
        name: "message_id",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "MessageId",
        },
        description: "Editing message identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "NewMessageBody",
    },
  },
  {
    id: "deleteMessage",
    command: "delete-message",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/messages",
    },
    effect: "destructive",
    summary: "Delete message",
    description: "Deletes message in a dialog, chat or channel if bot has permission to delete messages.",
    tags: ["messages"],
    parameters: [
      {
        name: "message_id",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "MessageId",
        },
        description: "Deleting message identifier",
      },
    ],
  },
  {
    id: "getMessageById",
    command: "get-message-by-id",
    binding: {
      kind: "http",
      method: "GET",
      path: "/messages/{messageId}",
    },
    effect: "read",
    summary: "Get message",
    description: "Returns single message by its identifier.",
    tags: ["messages"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) to get single message in chat or channel",
      },
    ],
    response: {
      confidence: "contract",
      schema: "Message",
    },
  },
  {
    id: "getComments",
    command: "get-comments",
    binding: {
      kind: "http",
      method: "GET",
      path: "/messages/{messageId}/comments",
    },
    effect: "read",
    summary: "Get comments",
    description:
      "Returns comments for a message in channel: result page and marker referencing to the next page. Comments traversed in reverse direction so the latest comment for the message will be first in result array. Additional permissions may require",
    tags: ["comments"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) of the commented message",
      },
      {
        name: "comment_ids",
        in: "query",
        required: false,
        schema: {
          nullable: true,
          type: "array",
          items: {
            type: "ref",
            ref: "MessageId",
          },
          uniqueItems: true,
        },
        description: "Comma-separated list of comment ids to get",
      },
      {
        name: "before",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int64",
          minimum: 0,
        },
        description: "Comments before timestamp",
      },
      {
        name: "after",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int64",
          minimum: 0,
        },
        description: "Comments after timestamp",
      },
      {
        name: "count",
        in: "query",
        required: false,
        schema: {
          default: 50,
          type: "integer",
          format: "int32",
          minimum: 1,
          maximum: 100,
        },
        description: "Maximum amount of comments in response",
      },
    ],
    response: {
      confidence: "contract",
      schema: "CommentMessageList",
    },
  },
  {
    id: "sendComment",
    command: "send-comment",
    binding: {
      kind: "http",
      method: "POST",
      path: "/messages/{messageId}/comments",
    },
    effect: "write",
    summary: "Send comment",
    description:
      "Sends a comment to a message in channel. Attachments are not allowed in comments. Additional permissions may require",
    tags: ["comments"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) of the commented message",
      },
      {
        name: "disable_link_preview",
        in: "query",
        required: false,
        schema: {
          default: false,
          type: "boolean",
        },
        description: "If `false`, server will not generate media preview for links in text",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "NewCommentBody",
    },
    response: {
      confidence: "contract",
      schema: "SendCommentResult",
    },
  },
  {
    id: "editComment",
    command: "edit-comment",
    binding: {
      kind: "http",
      method: "PUT",
      path: "/messages/{messageId}/comments",
    },
    effect: "write",
    summary: "Edit comment",
    description:
      "Updated comment should be sent as `NewCommentBody` in a request body. Attachments are not allowed in comments. Additional permissions may require",
    tags: ["comments"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) of the commented message",
      },
      {
        name: "comment_id",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "MessageId",
        },
        description: "Editing comment identifier",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "NewCommentBody",
    },
  },
  {
    id: "deleteComment",
    command: "delete-comment",
    binding: {
      kind: "http",
      method: "DELETE",
      path: "/messages/{messageId}/comments",
    },
    effect: "destructive",
    summary: "Delete comment",
    description: "Deletes comment for a message in channel if bot has permission to delete messages.",
    tags: ["comments"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) of the commented message",
      },
      {
        name: "comment_id",
        in: "query",
        required: true,
        schema: {
          type: "ref",
          ref: "MessageId",
        },
        description: "Deleting comment identifier",
      },
    ],
  },
  {
    id: "getCommentById",
    command: "get-comment-by-id",
    binding: {
      kind: "http",
      method: "GET",
      path: "/messages/{messageId}/comments/{commentId}",
    },
    effect: "read",
    summary: "Get comment",
    description: "Returns single comment by its identifier. Additional permissions may require",
    tags: ["comments"],
    parameters: [
      {
        name: "messageId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Message identifier (`mid`) of the commented message",
      },
      {
        name: "commentId",
        in: "path",
        required: true,
        schema: {
          description: "Message identifier",
          type: "string",
          minLength: 1,
          pattern: "(mid.)?[a-zA-Z0-9_\\-]+",
        },
        description: "Comment identifier (`mid`) to get single comment in channel",
      },
    ],
    response: {
      confidence: "contract",
      schema: "CommentMessage",
    },
  },
  {
    id: "getVideoAttachmentDetails",
    command: "get-video-attachment-details",
    binding: {
      kind: "http",
      method: "GET",
      path: "/videos/{videoToken}",
    },
    effect: "read",
    summary: "Get video details",
    description: "Returns detailed information about video attachment: playback URLs and additional metadata.",
    tags: ["messages"],
    parameters: [
      {
        name: "videoToken",
        in: "path",
        required: true,
        schema: {
          type: "string",
          pattern: "[\\w-]+",
        },
        description: "Video attachment token",
      },
    ],
    response: {
      confidence: "contract",
      schema: "VideoAttachmentDetails",
    },
  },
  {
    id: "answerOnCallback",
    command: "answer-on-callback",
    binding: {
      kind: "http",
      method: "POST",
      path: "/answers",
    },
    effect: "write",
    summary: "Answer on callback",
    description:
      "This method should be called to send an answer after a user has clicked the button. The answer may be an updated message or/and a one-time user notification.",
    tags: ["messages"],
    parameters: [
      {
        name: "callback_id",
        in: "query",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
          pattern: "^\\s*\\S[\\s\\S]*$",
        },
        description:
          "Identifies a button clicked by user. Bot receives this identifier after user pressed button as part of `MessageCallbackUpdate`",
      },
      {
        name: "disable_link_preview",
        in: "query",
        required: false,
        schema: {
          default: false,
          type: "boolean",
        },
        description: "If `true`, server will not generate media preview for links in updated message text",
      },
    ],
    request: {
      required: true,
      confidence: "contract",
      schema: "CallbackAnswer",
    },
  },
  {
    id: "getUpdates",
    command: "get-updates",
    binding: {
      kind: "http",
      method: "GET",
      path: "/updates",
    },
    effect: "write",
    summary: "Get updates",
    description:
      "Receiving updates via Long Polling is limited in speed and event retention time — this method is not suitable for production environments. We recommend using Webhook at all stages of work.\n\nYou can use this method for getting updates in case your bot is not subscribed to WebHook. The method is based on long polling.\n\nEvery update has its own sequence number. `marker` property in response points to the next upcoming update.\n\nAll previous updates are considered as *committed* after passing `marker` parameter.\nIf `marker` parameter is **not passed**, your bot will get all updates happened after the last commitment.",
    tags: ["subscriptions"],
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          default: 100,
          type: "integer",
          minimum: 1,
          maximum: 1000,
        },
        description: "Maximum number of updates to be retrieved",
      },
      {
        name: "timeout",
        in: "query",
        required: false,
        schema: {
          default: 30,
          type: "integer",
          minimum: 0,
          maximum: 90,
        },
        description: "Timeout in seconds for long polling",
      },
      {
        name: "marker",
        in: "query",
        required: false,
        schema: {
          nullable: true,
          type: "integer",
          format: "int64",
        },
        description: "Pass `null` to get updates you didn't get yet",
      },
      {
        name: "types",
        in: "query",
        required: false,
        schema: {
          nullable: true,
          type: "array",
          items: {
            type: "string",
          },
          uniqueItems: true,
        },
        description: "Comma separated list of update types your bot want to receive",
      },
    ],
    response: {
      confidence: "contract",
      schema: "UpdateList",
    },
  },
]
