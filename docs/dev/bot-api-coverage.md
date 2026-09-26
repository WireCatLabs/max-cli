<!--
GENERATED. DO NOT EDIT.
Source: spec/bot/schema.yaml
Run: pnpm bot:generate
-->

# MAX Bot API coverage

33 operations from openapi 0.0.33.

| Operation | Call | Command | Effect | Request source | Status | Summary |
|---|---|---|---|---|---|---|
| `getMyInfo` | `GET /me` | `max bot api get-my-info` | read | — | generated | Get current bot info |
| `editMyCommands` | `PATCH /me/commands` | `max bot api edit-my-commands` | write | contract | generated | Edit current bot commands |
| `getChat` | `GET /chats/{chatId}` | `max bot api get-chat` | read | — | generated | Get chat |
| `editChat` | `PATCH /chats/{chatId}` | `max bot api edit-chat` | write | contract | generated | Edit chat or channel info |
| `sendAction` | `POST /chats/{chatId}/actions` | `max bot api send-action` | write | contract | generated | Send action |
| `getPinnedMessage` | `GET /chats/{chatId}/pin` | `max bot api get-pinned-message` | read | — | generated | Get pinned message |
| `pinMessage` | `PUT /chats/{chatId}/pin` | `max bot api pin-message` | write | contract | generated | Pin message |
| `unpinMessage` | `DELETE /chats/{chatId}/pin` | `max bot api unpin-message` | write | — | generated | Unpin message |
| `getMembership` | `GET /chats/{chatId}/members/me` | `max bot api get-membership` | read | — | generated | Get chat or channel membership |
| `leaveChat` | `DELETE /chats/{chatId}/members/me` | `max bot api leave-chat` | destructive | — | generated | Leave chat |
| `getAdmins` | `GET /chats/{chatId}/members/admins` | `max bot api get-admins` | read | — | generated | Get chat or channel admins |
| `postAdmins` | `POST /chats/{chatId}/members/admins` | `max bot api post-admins` | write | contract | generated | Set chat or channel admins |
| `deleteAdmins` | `DELETE /chats/{chatId}/members/admins/{userId}` | `max bot api delete-admins` | write | — | generated | Revoke admin rights |
| `getMembers` | `GET /chats/{chatId}/members` | `max bot api get-members` | read | — | generated | Get members |
| `addMembers` | `POST /chats/{chatId}/members` | `max bot api add-members` | write | contract | generated | Add members |
| `removeMember` | `DELETE /chats/{chatId}/members` | `max bot api remove-member` | write | — | generated | Remove member |
| `getSubscriptions` | `GET /subscriptions` | `max bot api get-subscriptions` | read | — | generated | Get subscriptions |
| `subscribe` | `POST /subscriptions` | `max bot api subscribe` | write | contract | generated | Subscribe |
| `unsubscribe` | `DELETE /subscriptions` | `max bot api unsubscribe` | write | — | generated | Unsubscribe |
| `getUploadUrl` | `POST /uploads` | `max bot api get-upload-url` | write | — | generated | Get upload URL |
| `getMessages` | `GET /messages` | `max bot api get-messages` | read | — | generated | Get messages |
| `sendMessage` | `POST /messages` | `max bot api send-message` | write | contract | generated | Send message |
| `editMessage` | `PUT /messages` | `max bot api edit-message` | write | contract | generated | Edit message |
| `deleteMessage` | `DELETE /messages` | `max bot api delete-message` | destructive | — | generated | Delete message |
| `getMessageById` | `GET /messages/{messageId}` | `max bot api get-message-by-id` | read | — | generated | Get message |
| `getComments` | `GET /messages/{messageId}/comments` | `max bot api get-comments` | read | — | generated | Get comments |
| `sendComment` | `POST /messages/{messageId}/comments` | `max bot api send-comment` | write | contract | generated | Send comment |
| `editComment` | `PUT /messages/{messageId}/comments` | `max bot api edit-comment` | write | contract | generated | Edit comment |
| `deleteComment` | `DELETE /messages/{messageId}/comments` | `max bot api delete-comment` | destructive | — | generated | Delete comment |
| `getCommentById` | `GET /messages/{messageId}/comments/{commentId}` | `max bot api get-comment-by-id` | read | — | generated | Get comment |
| `getVideoAttachmentDetails` | `GET /videos/{videoToken}` | `max bot api get-video-attachment-details` | read | — | generated | Get video details |
| `answerOnCallback` | `POST /answers` | `max bot api answer-on-callback` | write | contract | generated | Answer on callback |
| `getUpdates` | `GET /updates` | `max bot api get-updates` | write | — | generated | Get updates |
