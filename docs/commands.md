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
| `-V, --version` | output the version number |
| `-v, --verbose` | more detail in what is shown: -v ids, -vv everything we know По умолчанию: `0`. |
| `--json` | machine-readable output: one JSON value on stdout, nothing else |
| `--jsonl` | machine-readable output: one JSON object per line, for streaming and jq |
| `--quiet` | diagnostics off |
| `--trace` | one line per request on stderr: ids and timings, never message content |
| `--timeout <duration>` | give up on the whole command after this — 30s, 2m, 500ms |
| `--offline` | answer from what was recorded and never connect; fails if nothing was |
| `--record` | keep this run under `max runs` — ids and timings, never message content |
| `--no-record` | do not keep it, whatever the configuration says |
| `--serve` | start `max serve` in the background if it is not running (the default) |
| `--no-serve` | do not start it; log in on this command's own connection unless one is running |

## `max session`

the stored MAX session for this profile

### `max session start`

log this profile in to MAX

```sh
max session start [method]
```

| Аргумент | | Что это |
|---|---|---|
| `method` | необязательный | token (pasted or piped), qr, qr-chrome or sms |

### `max session end`

forget the stored session for this profile

```sh
max session end
```

## `max account`

the account this profile is logged in as

### `max account show`

who this profile is logged in as; the phone number shows its last four digits

```sh
max account show [options]
```

| Опция | Что делает |
|---|---|
| `--show-phone` | print the whole phone number |

### `max account update`

change the name, the description or the photo everyone sees on your profile

**Меняет что-то в MAX.**

```sh
max account update [options]
```

| Опция | Что делает |
|---|---|
| `--first-name <name>` | your first name |
| `--last-name <name>` | your last name |
| `--description <text>` | about you |
| `--photo <file>` | a new profile photo — an image file |

### `max account sessions`

where else this account is logged in — not `max session`, which is this tool's own login

#### `max account sessions list`

every device and browser logged in to this account

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
| `--others` | every session but this one — the only choice MAX offers |
| `--yes` | yes, log the other devices out |

## `max chats`

the chats this account is in

### `max chats list`

the chats this account is in

```sh
max chats list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show |
| `--page <n>` | which page, starting at 1 |
| `--all` | every row, no paging |
| `--search <text>` | only chats whose name contains this; at least 3 characters |
| `--kind <dialog\|group\|channel>` | only chats of this kind |
| `--unread` | only chats with unread messages |

### `max chats show`

one chat: its kind, unread count, last message time, who is in it, and a group's settings

```sh
max chats show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

### `max chats events`

who joined, left, was added or removed, and by whom — from the chat's service messages

```sh
max chats events <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

| Опция | Что делает |
|---|---|
| `--since <id-or-time>` | from this message id, ISO 8601 time, or 2h / 1d ago; 7 days ago if not given |
| `--event <names>` | only these, comma-separated, as MAX names them: new, add, remove, pin… |

### `max chats inspect`

what a link leads to, without joining it

```sh
max chats inspect <link>
```

| Аргумент | | Что это |
|---|---|---|
| `link` | обязательный | an invite link, https://max.ru/join/…, or a public one, https://max.ru/<name> |

### `max chats join`

join a group or channel by its link; the others in it see that you joined

**Меняет что-то в MAX.**

```sh
max chats join <link>
```

| Аргумент | | Что это |
|---|---|---|
| `link` | обязательный | an invite link, https://max.ru/join/…, or a public one, https://max.ru/<name> |

### `max chats mark-read`

mark a chat read; the other side sees that you read it

**Меняет что-то в MAX.**

```sh
max chats mark-read <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |

| Опция | Что делает |
|---|---|
| `--until <message>` | only up to this message id; the newest by default |

### `max chats leave`

leave a group or channel; the others in it see that you left

**Меняет что-то в MAX.**

```sh
max chats leave <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

### `max chats create`

create a group or a channel; the people added are told

**Меняет что-то в MAX.**

```sh
max chats create <title> [person] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `title` | обязательный | the group's name |
| `person` | необязательный | people to add: an id, or part of a name |

| Опция | Что делает |
|---|---|
| `--channel` | a private channel instead of a group; people join it by its link |

### `max chats members`

who is in a group or channel; add or remove people

#### `max chats members list`

everyone in a group or channel, from MAX: when their account was made and when they were last seen

```sh
max chats members list <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

#### `max chats members add`

add people; they are told

**Меняет что-то в MAX.**

```sh
max chats members add <chat> <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `person` | обязательный | an id, or part of a name |

| Опция | Что делает |
|---|---|
| `--history` | the people added also see the messages from before they came |

#### `max chats members remove`

remove people; their messages stay

**Меняет что-то в MAX.**

```sh
max chats members remove <chat> <person>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `person` | обязательный | an id, or part of a name |

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
| `chat` | обязательный | chat id, or part of a chat name |
| `person` | обязательный | an id, or part of a name |

| Опция | Что делает |
|---|---|
| `--can <rights>` | what they may do, comma-separated: read, members, admins, info, pin, link, post, edit, delete |

#### `max chats admins remove`

take an admin's rights back; they stay a member

**Меняет что-то в MAX.**

```sh
max chats admins remove <chat> <person>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `person` | обязательный | an id, or part of a name |

### `max chats update`

rename a group or channel, change its description, or turn one of its settings on or off

**Меняет что-то в MAX.**

```sh
max chats update <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

| Опция | Что делает |
|---|---|
| `--title <title>` | the new name |
| `--description <text>` | the new description |
| `--all-can-pin <on\|off>` | every member may pin messages |
| `--only-admins-add <on\|off>` | only admins may add members |
| `--only-admins-call <on\|off>` | only admins may start a call |
| `--only-owner-edits-info <on\|off>` | only the owner may change the name and photo |
| `--members-see-link <on\|off>` | members may see the invite link |

### `max chats link`

a group's invite link

#### `max chats link show`

the invite link, if you may see it

```sh
max chats link show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

#### `max chats link reset`

replace the invite link; the old one stops working

**Меняет что-то в MAX.**

```sh
max chats link reset <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

### `max chats folders`

your chat folders

#### `max chats folders list`

your chat folders, in the order MAX shows them

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
| `title` | обязательный | the folder's name; MAX refused 21 characters and took 15 |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat to put in it, by id or name; repeat it for more |

#### `max chats folders update`

rename a folder, or change which chats are in it

**Меняет что-то в MAX.**

```sh
max chats folders update <folder> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | folder id, or its title exactly |

| Опция | Что делает |
|---|---|
| `--title <title>` | a new name |
| `--add <chat>` | put a chat in it; repeat it for more |
| `--remove <chat>` | take a chat out of it; repeat it for more |

#### `max chats folders delete`

delete a folder; the chats in it stay

**Меняет что-то в MAX.**

```sh
max chats folders delete <folder>
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | folder id, or its title exactly |

### `max chats rules`

a group's moderation rules, kept on this machine

#### `max chats rules show`

the group's rules; the defaults, marked not saved, if it has none yet

```sh
max chats rules show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

#### `max chats rules set`

change one rule; the group's first change writes every rule with its default

```sh
max chats rules set <chat> <key> <value>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `key` | обязательный | one of: trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove |
| `value` | обязательный | see `max chats rules show`; lists are comma-separated and replace the old one |

#### `max chats rules unset`

put one rule back to its default

```sh
max chats rules unset <chat> <key>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `key` | обязательный | one of: trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove |

### `max chats check`

judge a group's new messages and members by its rules, and act as they allow

**Меняет что-то в MAX.**

```sh
max chats check <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

| Опция | Что делает |
|---|---|
| `--since <id-or-time>` | judge what came after this message id, ISO 8601 time, or 2h / 1d ago; the saved point stays |
| `--dry-run` | judge and plan; do nothing |
| `--allow-dangerous` | do what a rule at consent level flag asks: delete messages, remove people |
| `--max-actions <n>` | at most this many actions in one check; 10 if not given |

## `max contacts`

people you have a one-to-one chat with

### `max contacts list`

people you have a one-to-one chat with

```sh
max contacts list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show |
| `--page <n>` | which page, starting at 1 |
| `--all` | every row, no paging |
| `--order <recent\|name>` | newest conversation first, or alphabetical |
| `--search <text>` | only people whose name or @username contains this; at least 3 characters |

### `max contacts show`

one person and the chats you share with them

```sh
max contacts show <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id, @username, or part of a name |

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
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name |

### `max contacts remove`

remove a person from your contacts; the chat stays, a name you gave them may not

**Меняет что-то в MAX.**

```sh
max contacts remove <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name |

### `max contacts block`

stop a person from writing to you — they need not be a contact

**Меняет что-то в MAX.**

```sh
max contacts block <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name |

### `max contacts unblock`

let a blocked person write to you again

**Меняет что-то в MAX.**

```sh
max contacts unblock <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name |

### `max contacts rename`

give a person a name of your own — they do not see it

**Меняет что-то в MAX.**

```sh
max contacts rename <person> <first-name> [last-name]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | person id — `contacts lookup` finds one — or part of a known name |
| `first-name` | обязательный | the name you want to see for them |
| `last-name` | необязательный |  |

### `max contacts import`

upload phone numbers to MAX and add the people it has under them

**Меняет что-то в MAX.**

```sh
max contacts import <file>
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | one person per line: number, then a comma or a tab, then the name |

## `max messages`

read and send messages in a chat

### `max messages list`

recent messages in a chat, oldest first

```sh
max messages list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to read |
| `--before <id-or-time>` | read what came before this message id, this ISO 8601 time, or 2h / 1d ago |
| `--after <id-or-time>` | read what came after this message id, this ISO 8601 time, or 2h / 1d ago; not with --before |
| `--mark-read` | also mark the chat read up to the newest message shown; the other person sees it |
| `--transcribe` | hear voice messages not heard yet, on this machine; slow, the model must be downloaded |
| `--model <id>` | which downloaded speech model hears them; `max models audio list` shows them |

### `max messages search`

find messages in what this machine has already read

```sh
max messages search <text> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `text` | обязательный | what to look for; at least 3 characters |

| Опция | Что делает |
|---|---|
| `--chat <id>` | only this chat; an id, because searching never connects to resolve a name |
| `--limit <n>` | how many to show |

### `max messages show`

one message by its id

```sh
max messages show <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `message` | обязательный | message id |

### `max messages context`

a message and what came either side of it, oldest first

```sh
max messages context <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `message` | обязательный | message id |

| Опция | Что делает |
|---|---|
| `--before <n>` | how many before it По умолчанию: `5`. |
| `--after <n>` | how many after it По умолчанию: `5`. |

### `max messages download`

save a message's photos, files, videos and audio to a directory

```sh
max messages download <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `message` | обязательный | message id |

| Опция | Что делает |
|---|---|
| `--output <dir>` | where to save them По умолчанию: `.`. |

### `max messages transcribe`

turn a voice message into text, on this machine — the recording goes nowhere

```sh
max messages transcribe <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |
| `message` | обязательный | id of a voice message |

| Опция | Что делает |
|---|---|
| `--model <id>` | which downloaded speech model to use; `max models audio list` shows them |

### `max messages send`

send a text message; without [text], the text is read from stdin

**Меняет что-то в MAX.**

```sh
max messages send <chat> [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `text` | необязательный | the message |

| Опция | Что делает |
|---|---|
| `--reply-to <message>` | answer this message, by its id in the same chat |
| `--send-id <id>` | repeat a send whose outcome was unknown, without risking a second copy |
| `--silent` | deliver without a notification |
| `--no-preview` | no preview card for a link in the text |
| `--md, --markdown` | read **bold**, _italic_, ~~struck~~ and `code` in the text; \ keeps a mark literal |
| `--file <path>` | attach a file; the text becomes its caption |
| `--photo <path>` | attach a .jpg, .png or .webp as a photo; the text becomes its caption |
| `--allow-any-file` | send a file even from a hidden folder, ~/.ssh or this CLI's own folders |
| `--at <time>` | let the messenger send it later, even with this machine off: 2026-09-25T09:00 (local time), or 30m, 2h, 1d from now |

### `max messages scheduled`

messages waiting to be sent later in a chat, soonest first; cancel one in the MAX app

```sh
max messages scheduled <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

### `max messages edit`

change the text of your own message; the other side may have read it already

**Меняет что-то в MAX.**

```sh
max messages edit <chat> <message> [text]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the id of your own message |
| `text` | необязательный | the new text; without it, read from stdin |

### `max messages delete`

delete messages for you only; with --for-everyone, for everyone in the chat

**Меняет что-то в MAX.**

```sh
max messages delete <chat> <messages> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `messages` | обязательный | the message ids, at most 10 |

| Опция | Что делает |
|---|---|
| `--for-everyone` | delete for everyone in the chat, not only for you — they cannot get it back |
| `--allow-dangerous` | yes, delete — it cannot be undone |

### `max messages forward`

forward one message to another chat

**Меняет что-то в MAX.**

```sh
max messages forward <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | the chat the message is in: a chat: its id, or part of its title |
| `message` | обязательный | the message id |

| Опция | Что делает |
|---|---|
| `--to <chat>` | where it goes: a chat: its id, or part of its title |
| `--silent` | deliver it without a notification |

### `max messages pin`

pin a message in a chat, quietly unless --notify

**Меняет что-то в MAX.**

```sh
max messages pin <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the message id |

| Опция | Что делает |
|---|---|
| `--notify` | tell the chat's members about the pin |

### `max messages unpin`

unpin a message in a chat

**Меняет что-то в MAX.**

```sh
max messages unpin <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the message id |

## `max store`

this machine's copy of a chat's messages: fetch it from MAX, export it to a file

### `max store fetch`

fetch a chat's history from MAX into this machine's copy, newest first, at most --max-pages a run; without --since or --last, back to the chat's start over as many runs as it takes

```sh
max store fetch <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

| Опция | Что делает |
|---|---|
| `--since <id-or-time>` | back to this message id, ISO 8601 time, or 2h / 1d ago |
| `--last <n>` | the newest n messages |
| `--estimate` | only say what the fetch would cost, from this machine's copy; nothing is sent |
| `--max-pages <n>` | pages of 30 per run По умолчанию: `40`. |
| `--pause <duration>` | the least wait between pages, 5s or 500ms; each is up to twice that По умолчанию: `5s`. |

### `max store export`

a chat's messages from this machine's copy to a file, oldest first, as JSON lines or Markdown; never connects

```sh
max store export <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name this machine has listed |

| Опция | Что делает |
|---|---|
| `--format <format>` | jsonl or md |
| `--since <id-or-time>` | only from this message id, ISO 8601 time, or 2h / 1d ago on |
| `--output <file>` | write to this file, readable only by you, instead of stdout |

## `max models`

models that run on this machine

### `max models audio`

speech models for transcribing voice messages

#### `max models audio list`

the models max can use, which are downloaded, and which one is the default

```sh
max models audio list
```

#### `max models audio download`

download a speech model once, checked against the sha256 this version of max expects

```sh
max models audio download <model>
```

| Аргумент | | Что это |
|---|---|---|
| `model` | обязательный | a model id from `max models audio list` |

## `max polls`

read a poll, vote in it, close your own, create one

### `max polls show`

a poll and its answer ids, as the message carries it now

```sh
max polls show <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the id of the message that carries the poll |

### `max polls vote`

vote in a poll, or take your vote back; the others see it unless the poll is anonymous

**Меняет что-то в MAX.**

```sh
max polls vote <chat> <message> [answers] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the id of the message that carries the poll |
| `answers` | необязательный | answer ids, as `polls show` prints them |

| Опция | Что делает |
|---|---|
| `--retract` | take your vote back |

### `max polls close`

close your own poll; nobody can vote after that, and it cannot be reopened

**Меняет что-то в MAX.**

```sh
max polls close <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the id of your own message that carries the poll |

### `max polls create`

send a poll to a chat, as a message of its own; public unless --anonymous

**Меняет что-то в MAX.**

```sh
max polls create <chat> <question> <answers> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `question` | обязательный | the question |
| `answers` | обязательный | two answers or more |

| Опция | Что делает |
|---|---|
| `--multiple` | people may pick several answers |
| `--anonymous` | nobody sees who voted for what |
| `--silent` | send without a notification |
| `--send-id <id>` | repeat a create whose outcome was unknown, without risking a second poll |

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
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the message id |
| `emoji` | обязательный | one emoji, for example 👍 |

### `max reactions remove`

take your reaction off a message

**Меняет что-то в MAX.**

```sh
max reactions remove <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title |
| `message` | обязательный | the message id |

## `max recipients`

the chats this profile may send to, when the list is on

### `max recipients list`

the chats on the list; empty and off until the first add

```sh
max recipients list
```

### `max recipients add`

allow sending to this chat; the first add turns the list on

```sh
max recipients add <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or part of a chat name |

### `max recipients remove`

stop allowing this chat; the list stays on

```sh
max recipients remove <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or the title as the list shows it |

### `max recipients clear`

empty the list and turn it off: this profile may send to any chat again

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
| `--limit <n>` | how many to show По умолчанию: `20`. |

## `max inbox`

other people's unread messages in every chat; --new for what arrived since the last check

```sh
max inbox [options]
```

| Опция | Что делает |
|---|---|
| `--new` | what arrived since the last check, each message once — for scheduled runs |
| `--since <id-or-time>` | what arrived after this message id, ISO 8601 time, or 2h / 1d ago; the saved point stays put |
| `--limit <n>` | at most this many per chat, the newest |
| `--transcribe` | hear voice messages not heard yet, on this machine; slow, the model must be downloaded |
| `--model <id>` | which downloaded speech model hears them; `max models audio list` shows them |

## `max review`

every message, yours too, in chats that changed since a point — for reviewing who owes what

```sh
max review [options]
```

| Опция | Что делает |
|---|---|
| `--since <id-or-time>` | where the last review ended — a message id, ISO 8601 time, or 2h / 1d ago; 3 days ago if not given |
| `--transcribe` | transcribe voice messages not heard yet; slow, and the model must be downloaded |
| `--chat <chat>` | only this chat: an id, or part of a chat name |
| `--unanswered [hours]` | only questions to you or a group's admins that nobody answered, asked at least this long ago; 24 hours if not given |

## `max serve`

stay connected to MAX and stream new messages to `max watch`, until Ctrl-C

```sh
max serve [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h is 60m |
| `--detach` | run in the background instead — the same as `max server start` |
| `--stop` | stop this profile's server — the same as `max server stop` |

## `max server`

this profile's background server: start, stop, status, restart

### `max server start`

start it in the background; answers once it is connected

```sh
max server start [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h is 60m |

### `max server stop`

stop it, however it was started

```sh
max server stop
```

### `max server status`

whether it runs, since when, which version, and whether it is connected to MAX

```sh
max server status
```

### `max server restart`

stop it and start it again, in the background — one login

```sh
max server restart [options]
```

| Опция | Что делает |
|---|---|
| `--idle <duration>` | stop after this long with nobody using it — 15m, 1h is 60m |

## `max watch`

print new messages as they arrive, from a running `max serve`

```sh
max watch [options]
```

| Опция | Что делает |
|---|---|
| `--events` | also print edits, deletions and reactions; every line then names its event |

## `max config`

the settings in force, and where each one came from

### `max config show`

the profile, the profiles that exist, and each setting with where it came from

```sh
max config show [options]
```

| Опция | Что делает |
|---|---|
| `--bot` | the settings a `max bot` command on this profile gets, rather than the personal account's |

### `max config set`

save a setting to the configuration file

```sh
max config set <setting> <value> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, sendsPerHour, senderColors, serve, mcpTools, readOtherBots, updateCheck, transcribeModel, defaultProfile |
| `value` | обязательный | a number, true or false, or for allow a list like send,reaction |

| Опция | Что делает |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile |
| `--personal` | only for personal accounts — the personal section of the file |
| `--bot` | only for bots — the bot section of the file |

### `max config unset`

remove a setting from the configuration file

```sh
max config unset <setting> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, sendsPerHour, senderColors, serve, mcpTools, readOtherBots, updateCheck, transcribeModel, defaultProfile |

| Опция | Что делает |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile |
| `--personal` | only for personal accounts — the personal section of the file |
| `--bot` | only for bots — the bot section of the file |

## `max doctor`

the state this installation is in, without contacting MAX unless --online

```sh
max doctor [options]
```

| Опция | Что делает |
|---|---|
| `--online` | also log in once, read one chat and start the MCP server; sends nothing |

### `max doctor report`

what a problem report holds and where it goes; writes nothing

#### `max doctor report create`

write a problem report to a file, and print how to send it

```sh
max doctor report create [options]
```

| Опция | Что делает |
|---|---|
| `--run <id>` | the run the report is about; the newest failed one if not given |
| `--output <file>` | where to write it; a new file in this directory if not given |

## `max cache`

the local copy of chats, contacts and messages

### `max cache clear`

forget everything this profile has cached

```sh
max cache clear
```

## `max runs`

recorded runs — what this tool did, and when

### `max runs list`

recorded runs, newest first

```sh
max runs list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show По умолчанию: `20`. |

### `max runs show`

one run: what it was, and one line per request

```sh
max runs show <run-id>
```

| Аргумент | | Что это |
|---|---|---|
| `run-id` | обязательный | an id from `max runs list` |

### `max runs path`

the directory holding one run

```sh
max runs path <run-id>
```

| Аргумент | | Что это |
|---|---|---|
| `run-id` | обязательный | an id from `max runs list` |

## `max skill`

the instructions an agent is given for this tool

### `max skill show`

print SKILL.md — redirect it into ~/.claude/skills/max-cli/SKILL.md for Claude Code, or ~/.agents/skills/max-cli/SKILL.md for Codex and Gemini CLI

```sh
max skill show
```

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
| `--check` | say whether a newer version exists, and install nothing |

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
| `--allow-send` | offer the send tool; without it the server can only read |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it |

### `max mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
max mcp config [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the send tool; without it the server can only read |
| `--confirm-send` | show the owner every write the server offers — sends, edits, reactions, mcpTools — in a form from the server first |
| `--allow-mark-read` | offer the tool that marks a chat read; the other person sees it |
| `--allow-delete` | offer the tool that deletes messages for you only; it cannot be undone |
| `--allow-moderate` | let max_chats_check act on a group's rules — delete others' messages, remove people — where they allow it |

## `max bot`

a MAX bot, through the official Bot API and a bot token — not your personal account

### `max bot auth`

the bot token this profile uses

#### `max bot auth set`

check a bot token with MAX, then keep it — typed at a hidden prompt or piped on stdin

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

```sh
max bot auth remove
```

### `max bot me`

the bot this profile's token belongs to: name, id, description, commands

```sh
max bot me
```

### `max bot list`

every name on this machine that has a bot token; --check asks MAX which bot each is

```sh
max bot list [options]
```

| Опция | Что делает |
|---|---|
| `--check` | ask MAX who each bot is |

### `max bot messages`

messages in the chats this bot is in

#### `max bot messages list`

the latest messages in a chat (--limit, up to 100) — its id, or the title of a chat this bot has seen; --offline answers from the local copy

```sh
max bot messages list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, up to 100 |

#### `max bot messages get`

one message by its id (mid.…)

```sh
max bot messages get <message>
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |

#### `max bot messages search`

search the messages this bot has read, sent or received on this machine — the local copy only, newest first; by text, by --from, or both

```sh
max bot messages search [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `text` | необязательный |  |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots |
| `--limit <n>` | how many |
| `--from <who>` | only what this person wrote — an id, @username or part of a name; repeat it for any of several |

#### `max bot messages between`

what two or more people wrote in the chats they have all written in — from the local copy, grouped by chat, oldest first; --limit counts per chat. Common chats are the ones this copy saw each of them write in, not a member list from MAX

```sh
max bot messages between <people> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `people` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots |
| `--limit <n>` | how many of the latest messages from each chat |

#### `max bot messages send`

send a message as the bot — to a chat id, `user:<id>`, or the title of a chat it has seen; - reads stdin

**Меняет что-то в MAX.**

```sh
max bot messages send <chat> [text] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `text` | необязательный | may be left out with --file |

| Опция | Что делает |
|---|---|
| `--format <format>` | how the text is marked up |
| `--reply-to <message>` | answer this message |
| `--silent` | no notification for the people in the chat |
| `--file <path>` | attach a file from disk: an image, video or audio by its extension, else a file |
| `--type <type>` | send --file as this kind instead of guessing |

#### `max bot messages edit`

replace the text of a message the bot sent; - reads stdin

**Меняет что-то в MAX.**

```sh
max bot messages edit <message> <text> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `text` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--format <format>` | how the text is marked up |

#### `max bot messages delete`

delete a message in a chat the bot can delete in

**Меняет что-то в MAX.**

```sh
max bot messages delete <message>
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |

### `max bot chats`

the chats this bot is in — MAX gives a bot no list of them, so `list` shows the ones it has seen

#### `max bot chats check`

judge a group's new messages and joins by its rules, and act as they allow — as the bot

**Меняет что-то в MAX.**

```sh
max bot chats check <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | chat id, or the title of a chat this bot has seen |

| Опция | Что делает |
|---|---|
| `--since <time>` | judge what came after this ISO 8601 time; the saved point stays |
| `--dry-run` | judge and plan; do nothing |
| `--allow-dangerous` | do what a rule at consent level flag asks: delete messages, remove people |
| `--no-ban` | remove without banning; by default a removed person cannot come back by the link |
| `--max-actions <n>` | at most this many actions in one check; 10 if not given |

#### `max bot chats rules`

a chat's moderation rules for this bot, kept on this machine

#### `max bot chats rules show`

the chat's rules; the defaults, marked not saved, if it has none yet

```sh
max bot chats rules show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot chats rules set`

change one rule — trusted, blocked, blockedNames, links, invites, forwards, blockedPeople, flood.messages, flood.minutes, flood.action, newAccount.days, newAccount.action, consent.delete, consent.remove

```sh
max bot chats rules set <chat> <key> <value>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `key` | обязательный |  |
| `value` | обязательный |  |

#### `max bot chats rules unset`

put one rule back to its default

```sh
max bot chats rules unset <chat> <key>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `key` | обязательный |  |

#### `max bot chats list`

chats this bot has seen on this machine — not a complete list from MAX

```sh
max bot chats list
```

#### `max bot chats get`

one chat from MAX, and remember it

```sh
max bot chats get <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot chats pin`

pin a message in a chat

**Меняет что-то в MAX.**

```sh
max bot chats pin <chat> <message>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `message` | обязательный |  |

#### `max bot chats unpin`

unpin whatever is pinned in a chat

**Меняет что-то в MAX.**

```sh
max bot chats unpin <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot chats leave`

the bot leaves the chat; only an admin can bring it back

**Меняет что-то в MAX.**

```sh
max bot chats leave <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot chats action`

show an action to the chat: typing_on, sending_photo, sending_video, sending_audio, sending_file, mark_seen

**Меняет что-то в MAX.**

```sh
max bot chats action <chat> <action>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `action` | обязательный |  |

### `max bot people`

people this bot has seen write — from the local copy on this machine, never asking MAX unless told to

#### `max bot people show`

one person — an id, @username or part of a name: the chats they wrote in (with their last message there) and the latest messages of their private chat with the bot

```sh
max bot people show <who> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `who` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--all-bots` | also read every other bot's copy on this machine that readOtherBots allows |
| `--bots <profiles>` | also read these bots' copies, comma separated — each allowed by readOtherBots |
| `--limit <n>` | how many messages from the private chat |
| `--refresh` | read the private chat with them from MAX first — one request |

### `max bot recipients`

the chats this bot may write to; with no list, every chat — `off` removes the list

#### `max bot recipients list`

the chats on the list, or nothing when there is no list

```sh
max bot recipients list
```

#### `max bot recipients add`

allow a chat: its id, `user:<id>`, or the title of a chat this bot has seen

```sh
max bot recipients add <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot recipients remove`

take a chat off the list

```sh
max bot recipients remove <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot recipients clear`

remove the list: the bot may write to any chat again

```sh
max bot recipients clear
```

### `max bot sends`

what this bot sent, edited and deleted from this machine — ids and outcomes, never text

#### `max bot sends list`



```sh
max bot sends list
```

### `max bot members`

the people in a group chat or channel the bot is in

#### `max bot members list`

members of a chat, a page at a time — --marker takes the `marker` the last page gave

```sh
max bot members list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many, up to 100 |
| `--marker <marker>` | continue from here |

#### `max bot members add`

add people to a chat by user id; the bot must be an admin that may add members

**Меняет что-то в MAX.**

```sh
max bot members add <chat> <users>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `users` | обязательный |  |

#### `max bot members remove`

remove a person from a chat

**Меняет что-то в MAX.**

```sh
max bot members remove <chat> <user> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `user` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--block` | also block them from coming back by the chat's link |

### `max bot admins`

the admins of a group chat or channel the bot is an admin in

#### `max bot admins list`

the admins of a chat and what each may do

```sh
max bot admins list <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |

#### `max bot admins add`

make a person an admin with the permissions named

**Меняет что-то в MAX.**

```sh
max bot admins add <chat> <user> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `user` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--permissions <list>` | a comma list: read_all_messages, add_remove_members, add_admins, change_chat_info, pin_message, edit_link, write, edit, delete, can_call, view_stats |
| `--alias <title>` | the title shown beside their name |

#### `max bot admins remove`

take a person's admin rights away; they stay in the chat

**Меняет что-то в MAX.**

```sh
max bot admins remove <chat> <user>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный |  |
| `user` | обязательный |  |

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
| `--limit <n>` | how many, up to 100 |

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
| `--format <format>` | how the text is marked up |

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
| `--format <format>` | how the text is marked up |

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
| `callback` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--text <text>` | the message's new text; - reads stdin |
| `--notification <text>` | a note only the person who pressed sees |

### `max bot commands`

the bot's command menu — what people see after /

#### `max bot commands list`

the commands in the menu now

```sh
max bot commands list
```

#### `max bot commands set`

replace the whole menu: each command as name=description, e.g. start=Начать

**Меняет что-то в MAX.**

```sh
max bot commands set <commands>
```

| Аргумент | | Что это |
|---|---|---|
| `commands` | обязательный |  |

#### `max bot commands clear`

empty the menu

**Меняет что-то в MAX.**

```sh
max bot commands clear
```

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
| `--type <type>` | upload as this kind instead of guessing by extension |

### `max bot webhooks`

where MAX pushes this bot's updates — while one is set, the bot cannot read updates by polling

#### `max bot webhooks list`

the webhooks this bot has

```sh
max bot webhooks list
```

#### `max bot webhooks set`

send this bot's updates to an HTTPS URL on port 443 — a new URL does not replace an old one, so every update would arrive twice; refused while another is set, unless --add

**Меняет что-то в MAX.**

```sh
max bot webhooks set <url> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `url` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--types <types>` | only these update types, a comma list (message_created,bot_started,…) |
| `--secret-stdin` | a secret MAX sends back in X-Max-Bot-Api-Secret — asked for, or read from a pipe |
| `--add` | keep the webhooks already set and add this one beside them |

#### `max bot webhooks delete`

stop sending updates to this URL; with none left, the bot can poll again

**Меняет что-то в MAX.**

```sh
max bot webhooks delete <url>
```

| Аргумент | | Что это |
|---|---|---|
| `url` | обязательный |  |

### `max bot updates`

what happens in this bot's chats, as MAX reports it

#### `max bot updates watch`

print updates as they arrive and keep their messages, until Ctrl-C — refused while a webhook is set

**Меняет что-то в MAX.**

```sh
max bot updates watch [options]
```

| Опция | Что делает |
|---|---|
| `--types <types>` | only these, comma separated: message_created,message_edited,bot_added,… |

### `max bot mcp`

serve this bot to an agent over MCP, on stdin and stdout — `claude mcp add sales-bot -- max sales bot mcp`

```sh
max bot mcp [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the tools that write as the bot; without it the server can only read |
| `--confirm-send` | show the owner every write in a form from the server first |
| `--allow-delete` | offer the tools that delete messages and comments; it cannot be undone |
| `--allow-moderate` | offer max_bot_chats_check and adding and removing members — the bot acts on a group's rules |

#### `max bot mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
max bot mcp config [options]
```

| Опция | Что делает |
|---|---|
| `--allow-send` | offer the tools that write as the bot; without it the server can only read |
| `--confirm-send` | show the owner every write in a form from the server first |
| `--allow-delete` | offer the tools that delete messages and comments; it cannot be undone |
| `--allow-moderate` | offer max_bot_chats_check and adding and removing members — the bot acts on a group's rules |

### `max bot api`

every operation of the official Bot API, generated from its schema — docs/dev/bot-api-coverage.md

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
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api get-chat`

Get chat — read (GET /chats/{chatId})

```sh
max bot api get-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Requested chat or channel identifier |

#### `max bot api edit-chat`

Edit chat or channel info — write (PATCH /chats/{chatId})

**Меняет что-то в MAX.**

```sh
max bot api edit-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api send-action`

Send action — write (POST /chats/{chatId}/actions)

**Меняет что-то в MAX.**

```sh
max bot api send-action [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api get-pinned-message`

Get pinned message — read (GET /chats/{chatId}/pin)

```sh
max bot api get-pinned-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier to get its pinned message |

#### `max bot api pin-message`

Pin message — write (PUT /chats/{chatId}/pin)

**Меняет что-то в MAX.**

```sh
max bot api pin-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier where message should be pinned |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api unpin-message`

Unpin message — write (DELETE /chats/{chatId}/pin)

**Меняет что-то в MAX.**

```sh
max bot api unpin-message [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier to remove pinned message |

#### `max bot api get-membership`

Get chat or channel membership — read (GET /chats/{chatId}/members/me)

```sh
max bot api get-membership [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |

#### `max bot api leave-chat`

Leave chat — destructive (DELETE /chats/{chatId}/members/me)

**Меняет что-то в MAX.**

```sh
max bot api leave-chat [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |

#### `max bot api get-admins`

Get chat or channel admins — read (GET /chats/{chatId}/members/admins)

```sh
max bot api get-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |

#### `max bot api post-admins`

Set chat or channel admins — write (POST /chats/{chatId}/members/admins)

**Меняет что-то в MAX.**

```sh
max bot api post-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api delete-admins`

Revoke admin rights — write (DELETE /chats/{chatId}/members/admins/{userId})

**Меняет что-то в MAX.**

```sh
max bot api delete-admins [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |
| `--user-id <value>` | User identifier |

#### `max bot api get-members`

Get members — read (GET /chats/{chatId}/members)

```sh
max bot api get-members [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |
| `--user-ids <value>` | Comma-separated list of users identifiers to get their membership. When this parameter is passed, both `count` and `marker` are ignored |
| `--marker <value>` | Marker |
| `--count <value>` | Count |

#### `max bot api add-members`

Add members — write (POST /chats/{chatId}/members)

**Меняет что-то в MAX.**

```sh
max bot api add-members [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api remove-member`

Remove member — write (DELETE /chats/{chatId}/members)

**Меняет что-то в MAX.**

```sh
max bot api remove-member [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier |
| `--user-id <value>` | User id to remove from chat or channel |
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
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api unsubscribe`

Unsubscribe — write (DELETE /subscriptions)

**Меняет что-то в MAX.**

```sh
max bot api unsubscribe [options]
```

| Опция | Что делает |
|---|---|
| `--url <value>` | URL to remove from WebHook subscriptions |

#### `max bot api get-upload-url`

Get upload URL — write (POST /uploads)

**Меняет что-то в MAX.**

```sh
max bot api get-upload-url [options]
```

| Опция | Что делает |
|---|---|
| `--type <value>` | Uploaded file type: image, audio, video, file |

#### `max bot api get-messages`

Get messages — read (GET /messages)

```sh
max bot api get-messages [options]
```

| Опция | Что делает |
|---|---|
| `--chat-id <value>` | Chat or channel identifier to get messages in chat or channel |
| `--message-ids <value>` | Comma-separated list of message ids to get |
| `--from <value>` | Start time for requested messages - use after instead |
| `--to <value>` | End time for requested messages  - use before instead |
| `--before <value>` | Messages before timestamp |
| `--after <value>` | Messages after timestamp |
| `--count <value>` | Maximum amount of messages in response |

#### `max bot api send-message`

Send message — write (POST /messages)

**Меняет что-то в MAX.**

```sh
max bot api send-message [options]
```

| Опция | Что делает |
|---|---|
| `--user-id <value>` | Fill this parameter if you want to send message to user |
| `--chat-id <value>` | Fill this if you send message to chat or channel |
| `--disable-link-preview <value>` | If `false`, server will not generate media preview for links in text |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api edit-message`

Edit message — write (PUT /messages)

**Меняет что-то в MAX.**

```sh
max bot api edit-message [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Editing message identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api delete-message`

Delete message — destructive (DELETE /messages)

**Меняет что-то в MAX.**

```sh
max bot api delete-message [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Deleting message identifier |

#### `max bot api get-message-by-id`

Get message — read (GET /messages/{messageId})

```sh
max bot api get-message-by-id [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) to get single message in chat or channel |

#### `max bot api get-comments`

Get comments — read (GET /messages/{messageId}/comments)

```sh
max bot api get-comments [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message |
| `--comment-ids <value>` | Comma-separated list of comment ids to get |
| `--before <value>` | Comments before timestamp |
| `--after <value>` | Comments after timestamp |
| `--count <value>` | Maximum amount of comments in response |

#### `max bot api send-comment`

Send comment — write (POST /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api send-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message |
| `--disable-link-preview <value>` | If `false`, server will not generate media preview for links in text |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api edit-comment`

Edit comment — write (PUT /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api edit-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message |
| `--comment-id <value>` | Editing comment identifier |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api delete-comment`

Delete comment — destructive (DELETE /messages/{messageId}/comments)

**Меняет что-то в MAX.**

```sh
max bot api delete-comment [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message |
| `--comment-id <value>` | Deleting comment identifier |

#### `max bot api get-comment-by-id`

Get comment — read (GET /messages/{messageId}/comments/{commentId})

```sh
max bot api get-comment-by-id [options]
```

| Опция | Что делает |
|---|---|
| `--message-id <value>` | Message identifier (`mid`) of the commented message |
| `--comment-id <value>` | Comment identifier (`mid`) to get single comment in channel |

#### `max bot api get-video-attachment-details`

Get video details — read (GET /videos/{videoToken})

```sh
max bot api get-video-attachment-details [options]
```

| Опция | Что делает |
|---|---|
| `--video-token <value>` | Video attachment token |

#### `max bot api answer-on-callback`

Answer on callback — write (POST /answers)

**Меняет что-то в MAX.**

```sh
max bot api answer-on-callback [options]
```

| Опция | Что делает |
|---|---|
| `--callback-id <value>` | Identifies a button clicked by user. Bot receives this identifier after user pressed button as part of `MessageCallbackUpdate` |
| `--disable-link-preview <value>` | If `true`, server will not generate media preview for links in updated message text |
| `--body <json>` | the request body as JSON; - reads it from stdin |
| `--body-file <path>` | the request body from a JSON file; - is stdin |

#### `max bot api get-updates`

Get updates — write (GET /updates)

**Меняет что-то в MAX.**

```sh
max bot api get-updates [options]
```

| Опция | Что делает |
|---|---|
| `--limit <value>` | Maximum number of updates to be retrieved |
| `--poll-timeout <value>` | Timeout in seconds for long polling |
| `--marker <value>` | Pass `null` to get updates you didn't get yet |
| `--types <value>` | Comma separated list of update types your bot want to receive |

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
