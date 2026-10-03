<!-- Сгенерировано из дерева команд скриптом scripts/commands.ts. Не редактировать; `pnpm generate`. -->

# Команды

Справочник: каждая команда, каждая опция, каждый код возврата. Страница **собирается из самой
программы**, поэтому описать версию, которой не существует, она не может.

Как устроена строка:

```sh
max [профиль] [опции] <команда> <действие> [аргументы]
```

**Первое слово — профиль**, если оно не совпадает с именем команды: `max personal chats list`
читает чаты профиля `personal`, а `max chats list` — профиля по умолчанию. То же самое говорит
переменная `MAX_PROFILE`; без неё профиль называется `default`.

⚠ Описания команд и опций ниже — ровно те, что печатает `max --help`, то есть по-английски. Это
не недоработка перевода: текст живёт в программе, и второй его копии здесь быть не должно.

## Общие опции

Действуют на любую команду.

| Опция | Что делает |
|---|---|
| `-V, --version` | output the version number. |
| `-v, --verbose` | more detail in what is shown: -v ids, -vv everything we know. По умолчанию: `0`. |
| `--json` | machine-readable output: one JSON value on stdout, nothing else. |
| `--jsonl` | machine-readable output: one JSON object per line, for streaming and jq. |
| `--quiet` | diagnostics off. |
| `--trace` | one line per request on stderr: ids and timings, never message content. |
| `--timeout <duration>` | give up on the whole command after this — 30s, 2m, 500ms. |
| `--offline` | answer from what was recorded and never connect; fails if nothing was. |
| `--yes` | go ahead without the question an ask level puts before a write. |
| `--record` | keep this run under `max runs` — ids and timings, never message content. |
| `--no-record` | do not keep it, whatever the configuration says. |
| `--serve` | start `max serve` in the background if it is not running (the default). |
| `--no-serve` | do not start it; log in on this command's own connection unless one is running. |

## `max session`

the stored MAX session for this profile

### `max session start`

log this profile in to MAX

```sh
max session start [method]
```

| Аргумент | | Что это |
|---|---|---|
| `method` | необязательный | token (pasted or piped), qr, qr-chrome or sms. Одно из: `token`, `qr`, `qr-chrome`, `sms`. По умолчанию: `token`. |

### `max session end`

forget the stored session for this profile

**Меняет что-то только на этом компьютере.**

```sh
max session end
```

## `max setup`

set up your personal MAX account and connect your agent

**Меняет что-то в MAX.**

```sh
max setup [options]
```

| Опция | Что делает |
|---|---|
| `--agent <agent>` | install the skill for this agent; asks at a terminal, otherwise none. Одно из: `none`, `codex`, `cursor`, `claude`, `gemini`, `all`. |
| `--method <method>` | how to log in when there is no session. Одно из: `token`, `qr`, `qr-chrome`, `sms`. По умолчанию: `qr`. |

## `max account`

the account this profile is logged in as

### `max account show`

who this profile is logged in as; the phone number shows its last four digits

```sh
max account show [options]
```

| Опция | Что делает |
|---|---|
| `--show-phone` | print the whole phone number. |

### `max account update`

change the name, the description or the photo everyone sees on your profile

**Меняет что-то в MAX.**

```sh
max account update [options]
```

| Опция | Что делает |
|---|---|
| `--first-name <name>` | your first name. |
| `--last-name <name>` | your last name. |
| `--description <text>` | about you. |
| `--photo <file>` | a new profile photo — an image file. |

### `max account sessions`

where else this account is logged in — not `max session`, which is this tool's own login

#### `max account sessions list`

every device and app logged in to this account; nothing is ended

```sh
max account sessions list
```

#### `max account sessions end`

log out every other device, your phone included; this one stays

**Меняет что-то в MAX.**

```sh
max account sessions end [options]
```

| Опция | Что делает |
|---|---|
| `--others` | every session but this one. |

## `max chats`

the chats this account is in

### `max chats list`

chats, newest first, archived ones included

```sh
max chats list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--all` | every row, no paging. |
| `--search <text>` | only chats whose name contains this; at least 3 characters. |
| `--kind <kind>` | only chats of this kind: dialog, group, channel, saved. |
| `--unread` | only chats with unread messages. |

### `max chats show`

one chat: its kind, unread count, last message time and who is in it

```sh
max chats show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

### `max chats events`

who joined, left, was added or removed, and by whom — from the chat's service messages

```sh
max chats events <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | ISO 8601, or 2h / 1d ago; 7 days ago if not given. |
| `--type <names>` | only these, comma-separated: join, leave, add, remove, create, title, pin. |

### `max chats inspect`

what an invite or public link leads to, without joining it

```sh
max chats inspect <link>
```

| Аргумент | | Что это |
|---|---|---|
| `link` | обязательный | an invite link or a public one. |

### `max chats join`

join a group or channel by its link; the others in it see that you joined

**Меняет что-то в MAX.**

```sh
max chats join <link>
```

| Аргумент | | Что это |
|---|---|---|
| `link` | обязательный | an invite link, or a public one. |

### `max chats mark-read`

mark a chat read; the other side sees that you read it

**Меняет что-то в MAX.**

```sh
max chats mark-read <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--until <message>` | only up to this message id; the newest by default. |

### `max chats leave`

leave a group or channel; the others in it see that you left

**Меняет что-то в MAX.**

```sh
max chats leave <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

### `max chats create`

create a group or a channel; the people added are told

**Меняет что-то в MAX.**

```sh
max chats create <title> [person] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `title` | обязательный | the group's name. |
| `person` | необязательный | people to add: an id, or part of a name. |

| Опция | Что делает |
|---|---|
| `--channel` | a private channel instead of a group; people join it by its link. |

### `max chats members`

who is in a group

#### `max chats members list`

everyone in a group, a page at a time, with their role and when they were last seen

```sh
max chats members list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--all` | every row, no paging. |

#### `max chats members add`

add people; they are told

**Меняет что-то в MAX.**

```sh
max chats members add <chat> <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | обязательный | an id, or part of a name. |

| Опция | Что делает |
|---|---|
| `--history` | the people added also see the messages from before they came. |

#### `max chats members remove`

remove people; their messages stay

**Меняет что-то в MAX.**

```sh
max chats members remove <chat> <person>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | обязательный | an id, or part of a name. |

### `max chats admins`

give or take back a member's admin rights

#### `max chats admins add`

make a member an admin with these rights

**Меняет что-то в MAX.**

```sh
max chats admins add <chat> <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | обязательный | an id, or part of a name. |

| Опция | Что делает |
|---|---|
| `--can <rights>` | what they may do, comma-separated: read, members, admins, info, pin, link, post, edit, delete. |

#### `max chats admins remove`

take an admin's rights back; they stay a member

**Меняет что-то в MAX.**

```sh
max chats admins remove <chat> <person>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | обязательный | an id, or part of a name. |

### `max chats update`

rename a group or channel, change its description, or turn one of its settings on or off

**Меняет что-то в MAX.**

```sh
max chats update <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--title <title>` | the new name. |
| `--description <text>` | the new description. |
| `--all-can-pin <on\|off>` | every member may pin messages. |
| `--only-admins-add <on\|off>` | only admins may add members. |
| `--only-admins-call <on\|off>` | only admins may start a call. |
| `--only-owner-edits-info <on\|off>` | only the owner may change the name and photo. |
| `--members-see-link <on\|off>` | members may see the invite link. |

### `max chats link`

a group's invite link

#### `max chats link show`

the invite link, if you may see it

```sh
max chats link show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

#### `max chats link reset`

replace the invite link; the old one stops working

**Меняет что-то в MAX.**

```sh
max chats link reset <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

### `max chats folders`

your chat folders

#### `max chats folders list`

your chat folders, in the order the app shows them

```sh
max chats folders list
```

#### `max chats folders create`

create a chat folder

**Меняет что-то в MAX.**

```sh
max chats folders create <title> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `title` | обязательный | the folder's name; the app may refuse a long one. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat to put in it, by id or name; repeat it for more. |

#### `max chats folders update`

rename a folder, or change which chats are in it

**Меняет что-то в MAX.**

```sh
max chats folders update <folder> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | folder id, or its title exactly. |

| Опция | Что делает |
|---|---|
| `--title <title>` | a new name. |
| `--add <chat>` | put a chat in it; repeat it for more. |
| `--remove <chat>` | take a chat out of it; repeat it for more. |

#### `max chats folders delete`

delete a folder; the chats in it stay

**Меняет что-то в MAX.**

```sh
max chats folders delete <folder>
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | folder id, or its title exactly. |

### `max chats rules`

what `chats moderate` judges a group by, kept in a file of this profile

#### `max chats rules show`

the group's rules; the defaults, marked not saved, if it has none yet

```sh
max chats rules show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

#### `max chats rules set`

change one rule; the group's first change writes every rule with its default

**Меняет что-то только на этом компьютере.**

```sh
max chats rules set <chat> <key> <value>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `key` | обязательный | one of: trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove. |
| `value` | обязательный | the new value; a list is comma-separated. |

#### `max chats rules unset`

put one rule back to its default

**Меняет что-то только на этом компьютере.**

```sh
max chats rules unset <chat> <key>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `key` | обязательный | one of: trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove. |

### `max chats moderate`

judge a group's new messages and members by its rules, and act as they allow

**Меняет что-то в MAX.**

```sh
max chats moderate <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | judge what came after this ISO 8601 time, or 2h / 1d ago; the saved point stays. |
| `--dry-run` | judge and plan; do nothing. |
| `--allow-dangerous` | yes to every action whose level in the group's rules is ask. |
| `--max-actions <n>` | at most this many actions in one run; 10 if not given. |

## `max contacts`

people you have a one-to-one chat with

### `max contacts list`

people you have a one-to-one chat with

```sh
max contacts list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--all` | every row, no paging. |
| `--order <recent\|name>` | newest conversation first, or alphabetical. По умолчанию: `recent`. |
| `--search <text>` | only people whose name or @username contains this. |

### `max contacts show`

one person and the chats you share with them

```sh
max contacts show <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |

### `max contacts sync`

forget where the last sync left off and take the whole list again

```sh
max contacts sync
```

### `max contacts lookup`

who MAX has under a phone number — asks for it, or reads it from stdin

```sh
max contacts lookup
```

### `max contacts add`

add a person to your contacts — `contacts list` still shows only people you have a dialog with

**Меняет что-то в MAX.**

```sh
max contacts add <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name. |

### `max contacts remove`

remove a person from your contacts; the chat stays, a name you gave them may not

**Меняет что-то в MAX.**

```sh
max contacts remove <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name. |

### `max contacts block`

stop a person from writing to you — they need not be a contact

**Меняет что-то в MAX.**

```sh
max contacts block <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name. |

### `max contacts unblock`

let a blocked person write to you again

**Меняет что-то в MAX.**

```sh
max contacts unblock <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name. |

### `max contacts rename`

give a person a name of your own — they do not see it

**Меняет что-то в MAX.**

```sh
max contacts rename <person> <first-name> [last-name]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name. |
| `first-name` | обязательный | the name you want to see for them. |
| `last-name` | необязательный |  |

### `max contacts import`

upload phone numbers and add the people the messenger has under them

**Меняет что-то в MAX.**

```sh
max contacts import <file>
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | one person per line: number, then a comma, a tab or a semicolon, then the name. |

## `max messages`

read and send messages in a chat

### `max messages list`

a chat's messages, oldest to newest

```sh
max messages list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many. |
| `--before-id <id>` | only messages older than this message id. |
| `--before-time <time>` | only messages older than this ISO 8601 time, or 2h / 1d ago. |
| `--after-id <id>` | only messages newer than this message id. |
| `--after-time <time>` | only messages newer than this ISO 8601 time, or 2h / 1d ago. |
| `--transcribe` | turn voice messages not heard yet into text — by the messenger, or a model on this machine; can take minutes. |
| `--model <id>` | which downloaded speech model hears them, with --transcribe; `models audio list` shows them. |
| `--mark-read` | also mark the chat read up to the newest message shown; the other person sees it. |

### `max messages search`

search the local store — what was read, fetched or kept by serve; never asks the messenger

```sh
max messages search <query> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | обязательный | strict Lucene query: words, "phrases", AND/OR/NOT, field groups and date ranges; --language legacy keeps discovery. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat — the same as chat: in the query; a chat: its id, or part of its title. |
| `--source <messenger>` | every account of this messenger held in the store; personal, bots or all — the same as in: in the query. |
| `--limit <n>` | how many. |
| `--newest` | newest first instead of best first. |
| `--context <n>` | messages before and after each hit; 2 in the terminal, 0 otherwise. |
| `--language <lucene\|legacy>` | the query language: strict Lucene or legacy discovery. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--regex` | the words are one regular expression, case-insensitive, tested against every stored text. |

### `max messages show`

one message, by its chat and id or by its msg: locator

```sh
max messages show <chat> [message]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title; or a msg: locator, with no message id after it. |
| `message` | необязательный | the message id. |

### `max messages context`

a message and what came either side of it, oldest first

```sh
max messages context <chat> [message] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title; or a msg: locator, with no message id after it. |
| `message` | необязательный | the message id. |

| Опция | Что делает |
|---|---|
| `--before-n <n>` | how many before it. По умолчанию: `5`. |
| `--after-n <n>` | how many after it. По умолчанию: `5`. |

### `max messages links`

why a message is in its conversation: each link it has, and the chain of answers back to the start

```sh
max messages links <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |

### `max messages download`

save a message's photos, files, videos and voice notes to a folder — or a whole chat's with --all

```sh
max messages download <chat> [message] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | необязательный | the message id; left out with --all. |

| Опция | Что делает |
|---|---|
| `--output-dir <dir>` | where to save them; created if missing. По умолчанию: `.`. |
| `--all` | every file of the chat, newest first; run it again to continue where it stopped. |
| `--pause <duration>` | with --all, a pause between pages, to stay under the provider's limits. По умолчанию: `5s`. |
| `--output <dir>` | compatibility alias for --output-dir. |

### `max messages evidence`

a bounded evidence packet from stored messages, newest first

```sh
max messages evidence <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, 1–100. |
| `--before-id <id>` | only messages older than this message id. |

### `max messages transcribe`

turn a voice message into text, on this machine — the recording goes nowhere

```sh
max messages transcribe <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name. |
| `message` | обязательный | id of a voice message. |

| Опция | Что делает |
|---|---|
| `--model <id>` | which downloaded speech model to use; `max models audio list` shows them. |

### `max messages send`

send a text message; without [text], the text is read from stdin

**Меняет что-то в MAX.**

```sh
max messages send <chat> [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `text` | необязательный | the message. |

| Опция | Что делает |
|---|---|
| `--topic <id>` | send to this forum topic; unsupported by messengers without topics. |
| `--reply-to <message>` | answer this message, by its id in the same chat. |
| `--send-id <id>` | repeat a send whose outcome was unknown, without risking a second copy. |
| `--silent` | deliver without a notification. |
| `--no-preview` | no preview card for a link in the text. |
| `--md` | read this messenger's Markdown; see its formatting guide for supported syntax. |
| `--file <file>` | attach a file; the text becomes its caption. |
| `--photo <file>` | attach a .jpg, .png or .webp as a photo; the text becomes its caption. |
| `--as-file` | send the --file as a file to download, a video included. |
| `--voice <file>` | send an Ogg Opus file as a voice message, alone, with no text. |
| `--allow-any-file` | send a file even from a hidden folder, \~/.ssh or this CLI's own folders. |
| `--at-time <time>` | let the messenger send it later, even with this machine off: 2026-09-25T09:00 (local time), or 30m, 2h, 1d from now. |

### `max messages scheduled`

messages waiting to be sent later in a chat, soonest first; cancel one in the app

```sh
max messages scheduled <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

### `max messages edit`

change the text of your own message; the other side may have read it already

**Меняет что-то в MAX.**

```sh
max messages edit <chat> <message> [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the id of your own message. |
| `text` | необязательный | the new text; without it, read from stdin. |

| Опция | Что делает |
|---|---|
| `--md` | read this messenger's Markdown; see its formatting guide for supported syntax. |

### `max messages delete`

delete messages for you only; with --for-everyone, for everyone in the chat

**Меняет что-то в MAX.**

```sh
max messages delete <chat> <messages> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `messages` | обязательный | the message ids, at most 10. |

| Опция | Что делает |
|---|---|
| `--for-everyone` | delete for everyone in the chat, not only for you — they cannot get it back. |
| `--allow-dangerous` | go ahead without the question an ask level puts before a deletion. |

### `max messages forward`

forward one message to another chat

**Меняет что-то в MAX.**

```sh
max messages forward <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | the chat the message is in: a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |

| Опция | Что делает |
|---|---|
| `--to <chat>` | where it goes: a chat: its id, or part of its title. |
| `--silent` | deliver it without a notification. |
| `--send-id <id>` | repeat a forward whose outcome was unknown, without risking a second copy. |

### `max messages pin`

pin a message in a chat, quietly unless --notify

**Меняет что-то в MAX.**

```sh
max messages pin <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |

| Опция | Что делает |
|---|---|
| `--notify` | tell the chat's members about the pin. |

### `max messages unpin`

unpin a message in a chat

**Меняет что-то в MAX.**

```sh
max messages unpin <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |

## `max store`

the local store of messages

### `max store status`

per chat: messages stored, the oldest and newest, and the stretches held completely

```sh
max store status [chat]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | необязательный | a chat: its id, or part of its title. |

### `max store fetch`

fetch a chat's history into the local store, newest first; run it again to continue

```sh
max store fetch <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | at most this many messages in this run; 1200 if not given. |
| `--page-size <n>` | how many messages one request asks for; 30 if not given. |
| `--pause <duration>` | the least pause between pages, to stay under the provider's limits; each is up to twice that. По умолчанию: `5s`. |
| `--since-time <time>` | stop once it reaches messages older than this: ISO 8601, or 2h / 1d ago. |
| `--last <n>` | stop once the newest n messages are held. |
| `--background` | run as a job that outlives this command; `store jobs show` follows it. |
| `--estimate` | only estimate how many messages, requests and minutes a full fetch would still take — from the store, no request. |

### `max store jobs`

background fetch jobs

#### `max store jobs list`

background fetch jobs, newest first

```sh
max store jobs list
```

#### `max store jobs show`

one background job — the newest when none is named — and what the store now holds of its chat

```sh
max store jobs show [job]
```

| Аргумент | | Что это |
|---|---|---|
| `job` | необязательный | the job id `store fetch --background` printed. |

#### `max store jobs cancel`

stop a running background job after its current page; a later fetch resumes where it stopped

```sh
max store jobs cancel <job>
```

| Аргумент | | Что это |
|---|---|---|
| `job` | обязательный | the job id. |

### `max store export`

a chat's stored messages as JSON lines, oldest first; never asks the messenger

```sh
max store export <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--format <format>` | jsonl (the default): one message per line; markdown: a transcript with a heading per day, replies and forwards quoted. |
| `--since-time <time>` | only from this ISO 8601 time, or 30m / 2h / 1d ago, on. |
| `--output <file>` | write JSON lines, or the transcript, to this new file, readable only by you. |

### `max store clear`

delete from the store the chats this account has left, with their messages

```sh
max store clear [options]
```

| Опция | Что делает |
|---|---|
| `--left` | the chats this account has left — the only thing this clears. |
| `--allow-dangerous` | yes, delete — it cannot be undone, and a chat you left cannot be fetched again. |

### `max store info`

the store file: where it is, its size, its schema and how many rows it holds; changes nothing

```sh
max store info
```

### `max store check`

whether the store is healthy — integrity, search indexes, disk, and which chats are behind

```sh
max store check
```

### `max store migrate`

bring the store up to this build's schema, then normalize the messages stored before it

```sh
max store migrate
```

### `max store reindex`

rebuild the word index and its typo vocabulary from the stored messages; loses no message

```sh
max store reindex
```

### `max store backup`

copy the store into a new file, while it is in use; never overwrites a file

```sh
max store backup <file>
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | the new file. |

### `max store restore`

put a backup in place of the store; the store it replaces is kept beside it, never deleted

```sh
max store restore <file>
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | a file `store backup` wrote. |

## `max conversations`

the conversations inside a chat, found in the stored messages by replies, mentions and who wrote next

### `max conversations build`

find a chat's conversations in what the store holds, replacing the last build; never asks the messenger

```sh
max conversations build [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |

### `max conversations list`

a chat's conversations, the newest first: when, how many messages, how many people

```sh
max conversations list [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--since-time <time>` | only those that started at this ISO 8601 time, or 30m / 2h / 1d ago, or later. |
| `--limit <n>` | how many. |

### `max conversations show`

one conversation's messages, oldest first — by its id, or the one a message is in

```sh
max conversations show <conversation> [message]
```

| Аргумент | | Что это |
|---|---|---|
| `conversation` | обязательный | a conversation id from `conversations list`; or a chat: its id, or part of its title, with a message. |
| `message` | необязательный | a message id in that chat: show the conversation it is in. |

### `max conversations search`

the conversations nearest to a query in meaning and in words, best first, in one chat or every one — meaning after `conversations embed`; runs on this machine

```sh
max conversations search <query> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | обязательный | what to look for, in your own words, in any language the model reads. |

| Опция | Что делает |
|---|---|
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embed through a service with your key instead of on this machine: openai. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |
| `--chat <chat>` | only this chat: a chat: its id, or part of its title. |
| `--since-time <time>` | only those still going at this ISO 8601 time, or 30m / 2h / 1d ago, or later. |
| `--limit <n>` | how many. |

### `max conversations batches`

windows of a chat for your own AI agent to link: which earlier message each one answers

#### `max conversations batches status`

how many messages still wait for an answer, in how many batches, and how much text

```sh
max conversations batches status [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--size <n>` | messages to answer per batch, 10–200; 50 by default. |

#### `max conversations batches next`

the next window to answer, with the messages before it; message text goes to stdout only

```sh
max conversations batches next [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--size <n>` | messages to answer per batch, 10–200; 50 by default. |

### `max conversations links`

your agent's answers: which earlier message each message of a batch answers

#### `max conversations links add`

store your agent's answer to a batch, read as JSON from stdin: { "model", "answers": [{ "message", "parent", "confidence" }] }; all or nothing

```sh
max conversations links add [options]
```

| Опция | Что делает |
|---|---|
| `--batch <id>` | the batch id `conversations batches next` printed. |

#### `max conversations links clear`

drop your agent's answers for a chat, or only one model's; messages are never touched

```sh
max conversations links clear [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | only the answers this model gave. |

### `max conversations embed`

compute a vector for each chunk of a chat's conversations for search by meaning — on this machine, or with --provider through a service and your key; resumes where it stopped

```sh
max conversations embed [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embed through a service with your key instead of on this machine: openai. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |
| `--workers <n>` | local: sessions in parallel, each with its own copy of the model (\~0.7 GB each). |
| `--threads <n>` | local: threads in all (default: min(8, cores)). |
| `--concurrency <n>` | remote: requests at once (default: 4). |
| `--max-tokens <n>` | remote: stop before a run that could send more tokens than this. |

#### `max conversations embed status`

how many chunks of a chat have a vector of the model, how many are left, and what is left costs

```sh
max conversations embed status [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embed through a service with your key instead of on this machine: openai. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |

#### `max conversations embed clear`

drop a chat's vectors, or only one model's; messages and conversations are never touched

```sh
max conversations embed clear [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embed through a service with your key instead of on this machine: openai. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |

## `max models`

models that run on this machine

### `max models audio`

speech models for transcribing voice messages

#### `max models audio list`

the speech models, most suitable first, which are downloaded, and which one is the default

```sh
max models audio list
```

#### `max models audio download`

download a speech model once, checked against the sha256 this version expects

```sh
max models audio download <model>
```

| Аргумент | | Что это |
|---|---|---|
| `model` | обязательный | a model id from `models audio list`. |

### `max models text`

embedding models for searching conversations by meaning

#### `max models text list`

the embedding models, most suitable first, which are downloaded, and which one is the default

```sh
max models text list
```

#### `max models text download`

download an embedding model once, checked against the sha256 this version expects

```sh
max models text download <model> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `model` | обязательный | a model id from `models text list`. |

| Опция | Что делает |
|---|---|
| `--accept-terms` | accept the model's licence terms, for a model that has its own. |

#### `max models text key`

the API key of an embedding service, for `conversations embed --provider`

#### `max models text key set`

store a key, typed at a hidden prompt or piped on stdin — never as an argument

```sh
max models text key set <provider>
```

| Аргумент | | Что это |
|---|---|---|
| `provider` | обязательный | openai, or the host of a --base-url server that wants a key. |

#### `max models text key remove`

forget a stored key

```sh
max models text key remove <provider>
```

| Аргумент | | Что это |
|---|---|---|
| `provider` | обязательный | openai, or a server's host. |

## `max polls`

read a poll, vote in it, close your own, create one

### `max polls show`

a poll and its answer ids, as the message carries it now

```sh
max polls show <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the id of the message that carries the poll. |

### `max polls vote`

vote in a poll, or take your vote back; the others see it unless the poll is anonymous

**Меняет что-то в MAX.**

```sh
max polls vote <chat> <message> [answers] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the id of the message that carries the poll. |
| `answers` | необязательный | answer ids, as `polls show` prints them. |

| Опция | Что делает |
|---|---|
| `--retract` | take your vote back. |

### `max polls close`

close your own poll; nobody can vote after that, and it cannot be reopened

**Меняет что-то в MAX.**

```sh
max polls close <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the id of your own message that carries the poll. |

### `max polls create`

send a poll to a chat, as a message of its own; public unless --anonymous

**Меняет что-то в MAX.**

```sh
max polls create <chat> <question> <answers> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `question` | обязательный | the question. |
| `answers` | обязательный | two answers or more. |

| Опция | Что делает |
|---|---|
| `--topic <id>` | send to this forum topic; unsupported by messengers without topics. |
| `--multiple` | people may pick several answers. |
| `--anonymous` | nobody sees who voted for what. |
| `--revote` | people may change their vote. |
| `--silent` | send without a notification. |
| `--send-id <id>` | repeat a create whose outcome was unknown, without risking a second poll. |

## `max reactions`

react to messages

### `max reactions add`

put your reaction on a message; it replaces the one you had

**Меняет что-то в MAX.**

```sh
max reactions add <chat> <message> <emoji>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |
| `emoji` | обязательный | one emoji, for example 👍. |

### `max reactions remove`

take your reaction off a message

**Меняет что-то в MAX.**

```sh
max reactions remove <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the message id. |

## `max recipients`

the chats this profile may send to, when the list is on

### `max recipients list`

the chats on the list; empty and off until the first add

```sh
max recipients list
```

### `max recipients add`

allow sending to this chat; the first add turns the list on

**Меняет что-то только на этом компьютере.**

```sh
max recipients add <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name. |

### `max recipients remove`

stop allowing this chat; the list stays on

**Меняет что-то только на этом компьютере.**

```sh
max recipients remove <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or the title as the list shows it. |

### `max recipients clear`

empty the list and turn it off: this profile may send to any chat again

**Меняет что-то только на этом компьютере.**

```sh
max recipients clear
```

## `max sends`

every attempt to send from this profile — never the text

### `max sends list`

attempts to send, newest first: sent, refused, failed, or not known

```sh
max sends list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. |

## `max inbox`

other people's unread messages in every chat; --new for what arrived since the last check

```sh
max inbox [options]
```

| Опция | Что делает |
|---|---|
| `--new` | what arrived since the last check, each message once — for scheduled runs. |
| `--since-time <time>` | what arrived after this ISO 8601 time, or 2h / 1d ago; the saved point stays put. |
| `--limit <n>` | at most this many per chat, the newest. |
| `--all` | muted and archived chats too — left out unless they mention you or reply to you. |
| `--transcribe` | turn voice messages not heard yet into text — by the messenger, or a model on this machine; can take minutes. |
| `--model <id>` | which downloaded speech model hears them, with --transcribe; `models audio list` shows them. |

## `max review`

every message, yours too, in chats that changed since a point — for reviewing who owes what

```sh
max review [options]
```

| Опция | Что делает |
|---|---|
| `--since-time <time>` | where the last review ended — ISO 8601, or 2h / 1d ago; 3 days ago if not given. |
| `--chat <chat>` | only this chat: a chat: its id, or part of its title. |
| `--unanswered [duration]` | only questions to you or a group's admins that nobody answered, asked at least this long ago — 4h, 1d; 24h if not given. |
| `--all` | muted and archived chats too — left out unless they mention you or reply to you. |
| `--transcribe` | turn voice messages not heard yet into text — by the messenger, or a model on this machine; can take minutes. |
| `--model <id>` | which downloaded speech model hears them, with --transcribe; `models audio list` shows them. |

## `max serve`

stay connected to MAX and stream new messages to `max watch`, until Ctrl-C

```sh
max serve [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h is 60m. |

## `max server`

`max serve` in the background: start, stop, restart, status, logs; install adds a systemd or launchd unit

### `max server start`

start serve in the background — through the unit if one is installed — and answer once it connects

```sh
max server start [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h. |

### `max server stop`

stop this profile's serve — through the unit if it runs under one

```sh
max server stop
```

### `max server restart`

stop it and start it again

```sh
max server restart [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h. |

### `max server status`

whether serve runs for this profile, since when, who started it, and the unit if there is one

```sh
max server status
```

### `max server logs`

serve's latest log lines — from the journal under systemd, else its log file

```sh
max server logs [options]
```

| Опция | Что делает |
|---|---|
| `-n, --lines <n>` | how many lines. По умолчанию: `50`. |

### `max server install`

write a systemd user unit or a launchd agent for this profile; starts nothing

```sh
max server install
```

### `max server uninstall`

remove this profile's unit; stop it first

```sh
max server uninstall
```

## `max watch`

print new messages as they arrive, from a running `max serve`

```sh
max watch [options]
```

| Опция | Что делает |
|---|---|
| `--events` | also print edits, deletions and reactions; every line then names its event. |

## `max config`

the settings in force, and where each one came from

### `max config show`

the profile, the profiles that exist, and each setting with where it came from

```sh
max config show [options]
```

| Опция | Что делает |
|---|---|
| `--bot` | the settings a `max bot` command on this profile gets, rather than the personal account's. |

### `max config set`

save a setting to the configuration file

**Меняет что-то только на этом компьютере.**

```sh
max config set <setting> <value> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, sendsPerHour, senderColors, serve, mcpTools, readOtherBots, updateCheck, skillHint, transcribeModel, defaultProfile. |
| `value` | обязательный | a number, true or false, or for allow a list like send,reaction. |

| Опция | Что делает |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile. |
| `--personal` | only for personal accounts — the personal section of the file. |
| `--bot` | only for bots — the bot section of the file. |

### `max config unset`

remove a setting from the configuration file

**Меняет что-то только на этом компьютере.**

```sh
max config unset <setting> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, sendsPerHour, senderColors, serve, mcpTools, readOtherBots, updateCheck, skillHint, transcribeModel, defaultProfile. |

| Опция | Что делает |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile. |
| `--personal` | only for personal accounts — the personal section of the file. |
| `--bot` | only for bots — the bot section of the file. |

## `max doctor`

the state this installation is in, without contacting MAX unless --online

```sh
max doctor [options]
```

| Опция | Что делает |
|---|---|
| `--online` | also log in once, read one chat and start the MCP server; sends nothing. |

### `max doctor report`

what a problem report holds and where it goes; writes nothing

#### `max doctor report create`

write a problem report to a file, and print how to send it

```sh
max doctor report create [options]
```

| Опция | Что делает |
|---|---|
| `--run <id>` | the run the report is about; the newest failed one if not given. |
| `--output <file>` | where to write it; a new file in this directory if not given. |

## `max runs`

recorded runs — what this tool did, and when

### `max runs list`

recorded runs, newest first

```sh
max runs list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. По умолчанию: `20`. |

### `max runs show`

one run: what it was, and one line per operation

```sh
max runs show <run-id>
```

| Аргумент | | Что это |
|---|---|---|
| `run-id` | обязательный | an id from `max runs list`. |

### `max runs path`

the directory holding one run

```sh
max runs path <run-id>
```

| Аргумент | | Что это |
|---|---|---|
| `run-id` | обязательный | an id from `max runs list`. |

## `max skill`

the instructions an agent is given for this tool

### `max skill show`

print SKILL.md — `max skill install` puts it where Claude Code, Codex and Gemini CLI look for it

```sh
max skill show [name]
```

| Аргумент | | Что это |
|---|---|---|
| `name` | необязательный | one of the skills shipped for a task: link-conversations. |

### `max skill install`

write SKILL.md to \~/.claude/skills/max-cli/ (Claude Code) and \~/.agents/skills/max-cli/ (Codex, Gemini CLI)

```sh
max skill install [options]
```

| Опция | Что делает |
|---|---|
| `--for <agents>` | which agents to install for. Одно из: `claude`, `agents`, `all`. По умолчанию: `all`. |

## `max commands`

every command, option and exit code as JSON — what an agent reads instead of --help

```sh
max commands
```

## `max upgrade`

upgrade max with the package manager that installed it; --check only looks

```sh
max upgrade [options]
```

| Опция | Что делает |
|---|---|
| `--check` | say whether a newer version exists, and install nothing. |

## `max complete`

shell completion: `max complete zsh` prints the script to source

```sh
max complete [words]
```

| Аргумент | | Что это |
|---|---|---|
| `words` | необязательный |  |

## `max mcp`

serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add max -- max mcp`

```sh
max mcp [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the send tool; without it the server can only read. |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first. |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it. |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone. |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it. |

### `max mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
max mcp config [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the send tool; without it the server can only read. |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first. |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it. |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone. |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it. |

### `max mcp setup`

add this profile's local MCP server to Codex or Claude Code

**Меняет что-то только на этом компьютере.**

```sh
max mcp setup <client> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `client` | обязательный | codex or claude-code. |

| Опция | Что делает |
|---|---|
| `--allow-writes` | acknowledge that this profile offers writing tools. |
| `--allow-send` | offer the send tool; without it the server can only read. |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first. |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it. |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone. |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it. |

### `max mcp doctor`

check this profile's local MCP handshake and tool list

```sh
max mcp doctor [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the send tool; without it the server can only read. |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first. |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it. |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone. |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it. |

## `max bot`

a MAX bot, through the official Bot API and a bot token — not your personal account

### `max bot auth`

the bot token this profile uses

#### `max bot auth set`

check a bot token with MAX, then keep it — typed at a hidden prompt or piped on stdin

**Меняет что-то только на этом компьютере.**

```sh
max bot auth set
```

#### `max bot auth show`

where this profile's bot token comes from, and which bot it is

```sh
max bot auth show
```

#### `max bot auth remove`

forget this profile's bot token

**Меняет что-то только на этом компьютере.**

```sh
max bot auth remove
```

### `max bot list`

every name on this machine that has a bot token; --check asks MAX which bot each is

```sh
max bot list [options]
```

| Опция | Что делает |
|---|---|
| `--check` | ask the messenger who each bot is, with its token. |

### `max bot chats`

the chats this bot is in — MAX gives a bot no list of them, so `list` shows the ones it has seen

#### `max bot chats list`

chats this bot has seen on this machine — not a complete list from MAX

```sh
max bot chats list
```

#### `max bot chats show`

one chat from MAX, and remember it

```sh
max bot chats show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |

#### `max bot chats leave`

take the bot out of a chat; only an admin of the chat can bring it back

**Меняет что-то в MAX.**

```sh
max bot chats leave <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |

#### `max bot chats action`

show what the bot is doing in a chat — typing, sending a photo — for a few seconds

**Меняет что-то в MAX.**

```sh
max bot chats action <chat> <action>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `action` | обязательный | what the chat sees. Одно из: `typing`, `photo`, `video`, `voice`, `file`. |

#### `max bot chats admins`

the admins of a chat the bot is an admin in

#### `max bot chats admins list`

the chat's admins and what each may do

```sh
max bot chats admins list <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |

#### `max bot chats admins add`

make a member an admin with these rights

**Меняет что-то в MAX.**

```sh
max bot chats admins add <chat> <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |
| `person` | обязательный | the person's user id. |

| Опция | Что делает |
|---|---|
| `--can <rights>` | what they may do, comma-separated: read, members, admins, info, pin, link, edit, delete. |
| `--title <title>` | the title shown beside their name. |

#### `max bot chats admins remove`

take an admin's rights back; they stay a member

**Меняет что-то в MAX.**

```sh
max bot chats admins remove <chat> <person>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |
| `person` | обязательный | the person's user id. |

#### `max bot chats members`

the people in a chat the bot is an admin in

#### `max bot chats members remove`

take a person out of a chat; their messages stay

**Меняет что-то в MAX.**

```sh
max bot chats members remove <chat> <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |
| `person` | обязательный | the person's user id. |

| Опция | Что делает |
|---|---|
| `--block` | also keep them from coming back by the chat's link. |

#### `max bot chats members list`

members of a chat, a page at a time — --marker takes the `marker` the last page gave

```sh
max bot chats members list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, up to 100. |
| `--marker <marker>` | continue from here. |

#### `max bot chats members add`

add people to a chat by user id; the bot must be an admin that may add members

**Меняет что-то в MAX.**

```sh
max bot chats members add <chat> <users>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `users` | обязательный |  |

#### `max bot chats rules`

a chat's moderation rules for this bot, kept on this machine

#### `max bot chats rules show`

the chat's rules; the defaults, marked not saved, if it has none yet

```sh
max bot chats rules show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a group's id, or the title of a group this bot has seen. |

#### `max bot chats rules set`

change one rule — trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove

**Меняет что-то только на этом компьютере.**

```sh
max bot chats rules set <chat> <key> <value>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a group's id, or the title of a group this bot has seen. |
| `key` | обязательный | the rule. |
| `value` | обязательный | its new value. |

#### `max bot chats rules unset`

put one rule back to its default

**Меняет что-то только на этом компьютере.**

```sh
max bot chats rules unset <chat> <key>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a group's id, or the title of a group this bot has seen. |
| `key` | обязательный | the rule. |

#### `max bot chats moderate`

judge a group's new messages and joins by its rules, and act as they allow — as the bot

**Меняет что-то в MAX.**

```sh
max bot chats moderate <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a group's id, or the title of a group this bot has seen. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | judge what came after this ISO 8601 time, or 2h / 1d ago; the saved point stays. |
| `--dry-run` | judge and plan; do nothing. |
| `--allow-dangerous` | yes to every action whose level in the group's rules is ask. |
| `--no-ban` | remove without banning; by default a removed person cannot come back by the link. |
| `--max-actions <n>` | at most this many actions in one run; 10 if not given. |

### `max bot messages`

the messages in the chats this bot is in

#### `max bot messages send`

send a message as the bot; without [text], the text is read from stdin

**Меняет что-то в MAX.**

```sh
max bot messages send <chat> [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `text` | необязательный | the message. |

| Опция | Что делает |
|---|---|
| `--reply-to <message>` | answer this message, by its id in the same chat. |
| `--silent` | deliver without a notification. |
| `--md` | read this messenger's Markdown; see its formatting guide for supported syntax. |
| `--html` | the text is HTML: <b>, <i>, <a href>, <code>. |
| `--file <file>` | attach a file; the text becomes its caption. |
| `--photo <file>` | attach a .jpg, .png or .webp as a photo; the text becomes its caption. |
| `--as-file` | send the --file as a file to download, a video included. |
| `--voice <file>` | send an Ogg Opus file as a voice message, alone, with no text. |
| `--allow-any-file` | send a file even from a hidden folder, \~/.ssh or this CLI's own folders. |

#### `max bot messages list`

the latest messages in a chat; where MAX gives a bot no history, and with --offline, the ones this bot has seen on this machine

```sh
max bot messages list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, the newest. |

#### `max bot messages show`

one message by its id in a chat

```sh
max bot messages show <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `message` | обязательный | message id. |

#### `max bot messages edit`

replace the text of a message the bot sent

**Меняет что-то в MAX.**

```sh
max bot messages edit <chat> <message> <text> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `message` | обязательный | message id. |
| `text` | обязательный | the new text. |

| Опция | Что делает |
|---|---|
| `--md` | read this messenger's Markdown; see its formatting guide for supported syntax. |
| `--html` | the text is HTML: <b>, <i>, <a href>, <code>. |

#### `max bot messages delete`

delete messages in a chat the bot can delete in; it cannot be undone

**Меняет что-то в MAX.**

```sh
max bot messages delete <chat> <messages> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `messages` | обязательный | message ids. |

| Опция | Что делает |
|---|---|
| `--allow-dangerous` | delete without asking. |

#### `max bot messages pin`

pin a message in a chat; quietly unless --notify

**Меняет что-то в MAX.**

```sh
max bot messages pin <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `message` | обязательный | message id. |

| Опция | Что делает |
|---|---|
| `--notify` | tell the chat's members. |

#### `max bot messages unpin`

unpin a message in a chat

**Меняет что-то в MAX.**

```sh
max bot messages unpin <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, user:<id> for a person, or the title of a chat this bot has seen. |
| `message` | обязательный | message id. |

#### `max bot messages search`

search the messages this bot has read, sent or received on this machine — the local copy only, best match first; every word must appear; "a phrase", -word, a OR b, from: chat: after: before: has:; by text, by --from, or both

```sh
max bot messages search [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | the words to find. |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows. |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots. |
| `--limit <n>` | how many. |
| `--newest` | newest first instead of best first. |
| `--from <who>` | only what this person wrote — an id, @username or part of a name; repeat it for any of several. |

#### `max bot messages between`

what two or more people wrote in the chats they have all written in — from the local copy, grouped by chat, oldest first; --limit counts per chat. Common chats are the ones this copy saw each of them write in, not a member list from MAX

```sh
max bot messages between <people> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `people` | обязательный | two or more people — an id, @username or part of a name each. |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows. |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots. |
| `--limit <n>` | how many of the latest messages from each chat. |

### `max bot recipients`

the chats this bot may write to; with no list, every chat — `clear` removes the list

#### `max bot recipients list`

the chats on the list, or nothing when there is no list

```sh
max bot recipients list
```

#### `max bot recipients add`

allow a chat: its id, `user:<id>`, or the title of a chat this bot has seen

**Меняет что-то только на этом компьютере.**

```sh
max bot recipients add <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot recipients remove`

take a chat off the list

**Меняет что-то только на этом компьютере.**

```sh
max bot recipients remove <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot recipients clear`

remove the list: the bot may write to any chat again

**Меняет что-то только на этом компьютере.**

```sh
max bot recipients clear
```

### `max bot sends`

what this bot sent, edited and deleted from this machine — ids and outcomes, never text

#### `max bot sends list`



```sh
max bot sends list
```

### `max bot watch`

print new messages as they arrive and keep them, until Ctrl-C or --timeout (either ends it normally)

```sh
max bot watch [options]
```

| Опция | Что делает |
|---|---|
| `--events` | also edits, deletions, buttons pressed and people coming and going; every line names its event. |
| `--types <types>` | only these update types, comma-separated, in the messenger's words. |

### `max bot callbacks`

answers to the buttons people press under the bot's messages

#### `max bot callbacks answer`

answer a pressed button by its callback id: --notification shows the person a one-time note, --text replaces the message the button was on

**Меняет что-то в MAX.**

```sh
max bot callbacks answer <callback> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `callback` | обязательный | the callback id `bot watch` printed. |

| Опция | Что делает |
|---|---|
| `--text <text>` | the message's new text. |
| `--notification <text>` | a note only the person who pressed sees. |

### `max bot commands`

the bot's command menu — what people see after /

#### `max bot commands list`

the commands in the menu now

```sh
max bot commands list
```

#### `max bot commands set`

replace the whole menu: each command as name=description, e.g. start=Begin

**Меняет что-то в MAX.**

```sh
max bot commands set <commands>
```

| Аргумент | | Что это |
|---|---|---|
| `commands` | обязательный | name=description, one per command. |

#### `max bot commands clear`

empty the menu

**Меняет что-то в MAX.**

```sh
max bot commands clear
```

### `max bot webhooks`

where the messenger pushes this bot's updates — while one is set, `bot watch` gets nothing

#### `max bot webhooks list`

the webhooks this bot has

```sh
max bot webhooks list
```

#### `max bot webhooks set`

send this bot's updates to an HTTPS address; refused while another is set

**Меняет что-то в MAX.**

```sh
max bot webhooks set <url> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `url` | обязательный | the HTTPS address. |

| Опция | Что делает |
|---|---|
| `--types <types>` | only these update types, comma-separated, in the messenger's words. |
| `--secret-stdin` | a secret the messenger sends back with each update — asked for, or read from a pipe. |
| `--add` | keep the webhooks already set and add this one beside them. |

#### `max bot webhooks delete`

stop sending updates to this address; with none left, `bot watch` works again

**Меняет что-то в MAX.**

```sh
max bot webhooks delete <url>
```

| Аргумент | | Что это |
|---|---|---|
| `url` | обязательный | the address. |

### `max bot contacts`

people this bot has seen write — from the local copy on this machine, never asking MAX unless told to

#### `max bot contacts show`

one person: the chats they wrote in (with their last message there) and the latest messages of their private chat with the bot

```sh
max bot contacts show <who> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `who` | обязательный | an id, @username or part of a name. |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows. |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots. |
| `--limit <n>` | how many messages from the private chat. |
| `--refresh` | read the private chat with them again from the messenger first — one request. |

### `max bot store`

the bot's local copy on this machine

#### `max bot store fetch`

fetch a chat's history into the bot's local copy, newest first; run it again to continue

```sh
max bot store fetch <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat id, or the title of a chat this bot has seen. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | at most this many messages in this run; 1000 if not given. |
| `--page-size <n>` | how many messages one request asks for; 100 if not given. |
| `--pause <duration>` | pause between pages, to stay under the messenger's limits. По умолчанию: `1s`. |
| `--since-time <time>` | stop once it reaches messages older than this: ISO 8601, or 2h / 1d ago. |
| `--last <n>` | stop once the newest n messages are held. |

### `max bot mcp`

serve this bot to an agent over MCP, on stdin and stdout — `claude mcp add sales-bot -- max sales bot mcp`

```sh
max bot mcp [options]
```

| Опция | Что делает |
|---|---|
| `--confirm-send` | show the owner every write in a form from the server first. |
| `--allow-dangerous` | no form before a deletion whose permission level is ask. |
| `--allow-send` | no longer used — the profile's permissions decide; kept so an old setup still starts. |
| `--allow-delete` | no longer used — the profile's permissions decide. |
| `--allow-moderate` | no longer used — the profile's permissions decide. |

#### `max bot mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
max bot mcp config [options]
```

| Опция | Что делает |
|---|---|
| `--confirm-send` | show the owner every write in a form from the server first. |
| `--allow-dangerous` | no form before a deletion whose permission level is ask. |
| `--allow-send` | no longer used — the profile's permissions decide; kept so an old setup still starts. |
| `--allow-delete` | no longer used — the profile's permissions decide. |
| `--allow-moderate` | no longer used — the profile's permissions decide. |

### `max bot me`

the bot this profile's token belongs to: name, id, description, commands

```sh
max bot me
```

### `max bot comments`

comments under a channel post — each command takes the post's message id (mid.…) first

#### `max bot comments list`

the comments under a post, newest last

```sh
max bot comments list <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, up to 100. |

#### `max bot comments get`

one comment under a post

```sh
max bot comments get <message> <comment>
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `comment` | обязательный |  |

#### `max bot comments send`

comment under a post as the bot; - reads stdin

**Меняет что-то в MAX.**

```sh
max bot comments send <message> <text> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `text` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--format <format>` | how the text is marked up. Одно из: `markdown`, `html`. |

#### `max bot comments edit`

replace the text of a comment the bot wrote; - reads stdin

**Меняет что-то в MAX.**

```sh
max bot comments edit <message> <comment> <text> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `comment` | обязательный |  |
| `text` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--format <format>` | how the text is marked up. Одно из: `markdown`, `html`. |

#### `max bot comments delete`

delete a comment under a post

**Меняет что-то в MAX.**

```sh
max bot comments delete <message> <comment>
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `comment` | обязательный |  |

### `max bot uploads`

files uploaded to MAX, to attach to a message

#### `max bot uploads put`

upload a file from disk and print the attachment to put in a message's `attachments` — `messages send --file` does both steps at once

**Меняет что-то в MAX.**

```sh
max bot uploads put <file> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--type <type>` | upload as this kind instead of guessing by extension. Одно из: `image`, `video`, `audio`, `file`. |

### `max bot api`

every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md

```sh
max bot api [options]
```

| Опция | Что делает |
|---|---|
| `--store-token <profile>` | keep a returned authentication token only in this bot profile's OS keyring; never print it. |

#### `max bot api get-my-info`

Get current bot info — read (GET /me)

```sh
max bot api get-my-info
```

#### `max bot api edit-my-commands`

Edit current bot commands — write (PATCH /me/commands)

**Меняет что-то в MAX.**

```sh
max bot api edit-my-commands [options]
```

| Опция | Что делает |
|---|---|
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api get-chat`

Get chat — read (GET /chats/{chatId})

```sh
max bot api get-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Requested chat or channel identifier. |

#### `max bot api edit-chat`

Edit chat or channel info — write (PATCH /chats/{chatId})

**Меняет что-то в MAX.**

```sh
max bot api edit-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api send-action`

Send action — write (POST /chats/{chatId}/actions)

**Меняет что-то в MAX.**

```sh
max bot api send-action [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api get-pinned-message`

Get pinned message — read (GET /chats/{chatId}/pin)

```sh
max bot api get-pinned-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier to get its pinned message. |

#### `max bot api pin-message`

Pin message — write (PUT /chats/{chatId}/pin)

**Меняет что-то в MAX.**

```sh
max bot api pin-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier where message should be pinned. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api unpin-message`

Unpin message — write (DELETE /chats/{chatId}/pin)

**Меняет что-то в MAX.**

```sh
max bot api unpin-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier to remove pinned message. |

#### `max bot api get-membership`

Get chat or channel membership — read (GET /chats/{chatId}/members/me)

```sh
max bot api get-membership [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |

#### `max bot api leave-chat`

Leave chat — destructive (DELETE /chats/{chatId}/members/me)

**Меняет что-то в MAX.**

```sh
max bot api leave-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |

#### `max bot api get-admins`

Get chat or channel admins — read (GET /chats/{chatId}/members/admins)

```sh
max bot api get-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |

#### `max bot api post-admins`

Set chat or channel admins — write (POST /chats/{chatId}/members/admins)

**Меняет что-то в MAX.**

```sh
max bot api post-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api delete-admins`

Revoke admin rights — write (DELETE /chats/{chatId}/members/admins/{userId})

**Меняет что-то в MAX.**

```sh
max bot api delete-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |
| `--user-id <value>` | User identifier. |

#### `max bot api get-members`

Get members — read (GET /chats/{chatId}/members)

```sh
max bot api get-members [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |
| `--user-ids <value>` | Comma-separated list of users identifiers to get their membership. When this parameter is passed, both `count` and `marker` are ignored. |
| `--marker <value>` | Marker. |
| `--count <value>` | Count. |

#### `max bot api add-members`

Add members — write (POST /chats/{chatId}/members)

**Меняет что-то в MAX.**

```sh
max bot api add-members [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api remove-member`

Remove member — write (DELETE /chats/{chatId}/members)

**Меняет что-то в MAX.**

```sh
max bot api remove-member [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier. |
| `--user-id <value>` | User id to remove from chat or channel. |
| `--block <value>` | Set to `true` if user should be blocked in chat. |

#### `max bot api get-subscriptions`

Get subscriptions — read (GET /subscriptions)

```sh
max bot api get-subscriptions
```

#### `max bot api subscribe`

Subscribe — write (POST /subscriptions)

**Меняет что-то в MAX.**

```sh
max bot api subscribe [options]
```

| Опция | Что делает |
|---|---|
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api unsubscribe`

Unsubscribe — write (DELETE /subscriptions)

**Меняет что-то в MAX.**

```sh
max bot api unsubscribe [options]
```

| Опция | Что делает |
|---|---|
| `--url <value>` | URL to remove from WebHook subscriptions. |

#### `max bot api get-upload-url`

Get upload URL — write (POST /uploads)

**Меняет что-то в MAX.**

```sh
max bot api get-upload-url [options]
```

| Опция | Что делает |
|---|---|
| `--type <value>` | Uploaded file type: image, audio, video, file. |

#### `max bot api get-messages`

Get messages — read (GET /messages)

```sh
max bot api get-messages [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier to get messages in chat or channel. |
| `--message-ids <value>` | Comma-separated list of message ids to get. |
| `--from <value>` | Start time for requested messages - use after instead. |
| `--to <value>` | End time for requested messages  - use before instead. |
| `--before <value>` | Messages before timestamp. |
| `--after <value>` | Messages after timestamp. |
| `--count <value>` | Maximum amount of messages in response. |

#### `max bot api send-message`

Send message — write (POST /messages)

**Меняет что-то в MAX.**

```sh
max bot api send-message [options]
```

| Опция | Что делает |
|---|---|
| `--user-id <value>` | Fill this parameter if you want to send message to user. |
| `--chat-id <value>` | Fill this if you send message to chat or channel. |
| `--disable-link-preview <value>` | If `false`, server will not generate media preview for links in text. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api edit-message`

Edit message — write (PUT /messages)

**Меняет что-то в MAX.**

```sh
max bot api edit-message [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Editing message identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api delete-message`

Delete message — destructive (DELETE /messages)

**Меняет что-то в MAX.**

```sh
max bot api delete-message [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Deleting message identifier. |

#### `max bot api get-message-by-id`

Get message — read (GET /messages/{messageId})

```sh
max bot api get-message-by-id [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) to get single message in chat or channel. |

#### `max bot api get-comments`

Get comments — read (GET /messages/{messageId}/comments)

```sh
max bot api get-comments [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message. |
| `--comment-ids <value>` | Comma-separated list of comment ids to get. |
| `--before <value>` | Comments before timestamp. |
| `--after <value>` | Comments after timestamp. |
| `--count <value>` | Maximum amount of comments in response. |

#### `max bot api send-comment`

Send comment — write (POST /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api send-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message. |
| `--disable-link-preview <value>` | If `false`, server will not generate media preview for links in text. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api edit-comment`

Edit comment — write (PUT /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api edit-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message. |
| `--comment-id <value>` | Editing comment identifier. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api delete-comment`

Delete comment — destructive (DELETE /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api delete-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message. |
| `--comment-id <value>` | Deleting comment identifier. |

#### `max bot api get-comment-by-id`

Get comment — read (GET /messages/{messageId}/comments/{commentId})

```sh
max bot api get-comment-by-id [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message. |
| `--comment-id <value>` | Comment identifier (`mid`) to get single comment in channel. |

#### `max bot api get-video-attachment-details`

Get video details — read (GET /videos/{videoToken})

```sh
max bot api get-video-attachment-details [options]
```

| Опция | Что делает |
|---|---|
| `--video-token <value>` | Video attachment token. |

#### `max bot api answer-on-callback`

Answer on callback — write (POST /answers)

**Меняет что-то в MAX.**

```sh
max bot api answer-on-callback [options]
```

| Опция | Что делает |
|---|---|
| `--callback-id <value>` | Identifies a button clicked by user. Bot receives this identifier after user pressed button as part of `MessageCallbackUpdate`. |
| `--disable-link-preview <value>` | If `true`, server will not generate media preview for links in updated message text. |
| `--body <json>` | the request body as JSON; - reads it from stdin. |
| `--body-file <path>` | the request body from a JSON file; - is stdin. |

#### `max bot api get-updates`

Get updates — write (GET /updates)

**Меняет что-то в MAX.**

```sh
max bot api get-updates [options]
```

| Опция | Что делает |
|---|---|
| `--limit <value>` | Maximum number of updates to be retrieved. |
| `--poll-timeout <value>` | Timeout in seconds for long polling. |
| `--marker <value>` | Pass `null` to get updates you didn't get yet. |
| `--types <value>` | Comma separated list of update types your bot want to receive. |

## Коды возврата

Скрипт ветвится по коду, а не по тексту: текст меняется, код — нет.

| Код | Когда |
|---|---|
| `0` | получилось |
| `2` | `validation_error` |
| `3` | `configuration_error` |
| `4` | `authentication_error` |
| `5` | `permission_error` |
| `6` | `not_found` |
| `7` | `confirmation_required` |
| `8` | `rate_limited` |
| `9` | `timeout` |
| `10` | `network_error` |
| `11` | `provider_error` |
| `12` | `provider_unavailable` |
| `13` | `invalid_response` |
| `14` | `outcome_unknown` |
| `130` | `cancelled` |
| `1` | всё остальное |

`0` и только `0` означает, что операция выполнена. `14` — `outcome_unknown` — означает, что
сообщение **могло** уйти: не отправлено и не провалено, и повторять его можно только с тем же
`--send-id`.
