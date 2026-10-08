<!-- Сгенерировано из дерева команд скриптом scripts/commands.ts. Не редактировать; `pnpm generate`. -->

# Команды

Справочник: каждая команда, каждая опция, каждый код возврата. Страница **собирается из самой
программы**, поэтому описать версию, которой не существует, она не может.

`chats send-as` и `--send-as` пока недоступны для MAX: команда откажет до отправки.

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
| `--no-input` | never prompt or open interactive login; piped input remains available. |
| `--max-input-bytes <bytes>` | maximum buffered input bytes (default: 16777216). |
| `--max-output-bytes <bytes>` | maximum machine output bytes (default: 4194304; 0 disables). |
| `--fields <paths>` | comma-separated item or object fields: id,text; preserve pagination and operation ids. |
| `--dry-run` | preview parsed arguments and permissions before running the action. |
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

log this profile out on MAX's side and forget the session here

**Меняет что-то в MAX.**

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

the logged-in account

### `max account list`

every profile on this computer, and the account each is logged in as; asks the messenger nothing

```sh
max account list
```

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

### `max account privacy`

who may find, call or add the account

#### `max account privacy show`

the account's privacy settings; reading changes nothing

```sh
max account privacy show
```

#### `max account privacy set`

change who may find, call or add the account; the settings not named stay

**Меняет что-то в MAX.**

```sh
max account privacy set [options]
```

| Опция | Что делает |
|---|---|
| `--find-by-phone <who>` | who finds the account by its number: everyone, contacts or nobody. |
| `--phone-number <who>` | who sees the number: everyone, contacts or nobody. |
| `--calls <who>` | who may call: everyone, contacts or nobody. |
| `--chat-invites <who>` | who may add the account to groups and channels: everyone, contacts or nobody. |
| `--hide-online <on\|off>` | hide online status and last seen. |

## `max calls`

the account's calls

### `max calls list`

calls made and received, newest first; reading changes nothing

```sh
max calls list [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many to show. |

## `max stickers`

the stickers the account has added

### `max stickers list`

sticker sets, or with --set the stickers in one; reading changes nothing

```sh
max stickers list [options]
```

| Опция | Что делает |
|---|---|
| `--set <id>` | the stickers in this set. |

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
| `--topic <id>` | mark only this forum topic read; unsupported by messengers without topics. |

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

#### `max chats members audit`

members that look like bots, each with its reasons — read from the member list and the local store; never one request per person, and it removes nobody

```sh
max chats members audit <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--budget <pages>` | at most this many pages of 200 members, a pause between them (default: 10). |
| `--min-score <n>` | only members scoring at least this; 1 lists everyone with a reason (default: 2). |
| `--deep <n>` | also check the top n in full — profile, photos and everything they wrote — one person a second; the public ban lists cover Telegram only, so nothing is sent. |

#### `max chats members history`

who joined, who left and whose profile changed, oldest first — what chats members fetch recorded in the local store; never asks the messenger

```sh
max chats members history <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | ISO 8601, or 2h / 1d ago; everything recorded if not given. |

#### `max chats members fetch`

read a group's whole member list into the local store's member history: who joined, who left, daily counts and profile changes; someone is recorded as gone only when every member was read

```sh
max chats members fetch <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--track` | also fetch it daily while serve runs; chats tracking lists and edits those chats. |
| `--budget <pages>` | at most this many pages of 200 members, a pause between them (default: 10). |

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

### `max chats tracking`

the chats whose member lists serve fetches daily into the local store — chats members fetch --track adds one

#### `max chats tracking list`

every tracked chat: since when, and its last member count

```sh
max chats tracking list
```

#### `max chats tracking show`

one chat: whether it is tracked, and its member count per day for the last 30 days

```sh
max chats tracking show <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

#### `max chats tracking add`

fetch this chat's member list daily while serve runs, from its next run

```sh
max chats tracking add <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

#### `max chats tracking remove`

stop fetching it daily; the history already kept stays

```sh
max chats tracking remove <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

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
| `--photo <file>` | a new photo for it — an image file. |
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

### `max chats requests`

requests to join a MAX channel needing approval

#### `max chats requests list`

pending requests to join a MAX channel needing approval; admins only; requestedAt is null

```sh
max chats requests list <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many. |
| `--search <text>` | only people whose name or @username has this. |
| `--link <link>` | not supported by MAX; use name search instead. |

#### `max chats requests accept`

let them in; the group sees them join

**Меняет что-то в MAX.**

```sh
max chats requests accept <chat> [person] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | необязательный | who asked: an id from `chats requests list`. |

| Опция | Что делает |
|---|---|
| `--all` | not supported by MAX; select one person from chats requests list. |
| `--link <link>` | not supported by MAX; select one person from chats requests list. |

#### `max chats requests decline`

turn the request away

**Меняет что-то в MAX.**

```sh
max chats requests decline <chat> [person] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `person` | необязательный | who asked: an id from `chats requests list`. |

| Опция | Что делает |
|---|---|
| `--all` | not supported by MAX; select one person from chats requests list. |
| `--link <link>` | not supported by MAX; select one person from chats requests list. |

### `max chats folders`

your chat folders

#### `max chats folders list`

your chat folders, in the order the app shows them

```sh
max chats folders list
```

#### `max chats folders show`

one chat folder, with the names of the chats in it

```sh
max chats folders show <folder>
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | the folder's id, or its title exactly. |

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
| `--remove <chat>` | take a chat out of it, and off its excluded and pinned lists; repeat it for more. |

#### `max chats folders delete`

delete a folder; the chats in it stay

**Меняет что-то в MAX.**

```sh
max chats folders delete <folder>
```

| Аргумент | | Что это |
|---|---|---|
| `folder` | обязательный | folder id, or its title exactly. |

#### `max chats folders order`

put folders in this order; the ones not named keep theirs after them

**Меняет что-то в MAX.**

```sh
max chats folders order <folders>
```

| Аргумент | | Что это |
|---|---|---|
| `folders` | обязательный | folder ids, or titles exactly, first one first. |

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

### `max chats media`

a chat's photos, videos, files, audio and links, from the messenger's server; reading marks nothing

```sh
max chats media <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--type <names>` | only these kinds, comma-separated: photo, video, file, audio, link. |
| `--limit <n>` | how many to show. |
| `--before-id <id>` | read what came before this message id. |

### `max chats mute`

stop notifications from a chat, for good or until a time; nobody in it is told

**Меняет что-то в MAX.**

```sh
max chats mute <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--until <time>` | only until then: 2026-09-25T09:00 (local time), or 30m, 2h, 7d from now. |

### `max chats unmute`

hear a muted chat again

**Меняет что-то в MAX.**

```sh
max chats unmute <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

### `max chats delete`

delete a chat from this account; the others in it keep it and its messages

**Меняет что-то в MAX.**

```sh
max chats delete <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--allow-dangerous` | go ahead without the question an ask level puts before a deletion. |

### `max chats clear`

delete every message in a chat for this account; the others in it keep theirs

**Меняет что-то в MAX.**

```sh
max chats clear <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--allow-dangerous` | go ahead without the question an ask level puts before a deletion. |

### `max chats start`

start a bot, as its Start button does; the bot sees that you started it

**Меняет что-то в MAX.**

```sh
max chats start <bot> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `bot` | обязательный | the chat with the bot — its id or its name — or the bot's link, even one never opened. |

| Опция | Что делает |
|---|---|
| `--payload <text>` | the start parameter the bot reads; a link's own ?start= when not given. |

### `max chats app`

the address that opens a bot's mini app, signed in as you — keep it to yourself

**Меняет что-то в MAX.**

```sh
max chats app <bot> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `bot` | обязательный | the chat with the bot: its id or its name. |

| Опция | Что делает |
|---|---|
| `--start <param>` | the start parameter the app reads. |

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
| `--search <text>` | only people whose name, local alias or @username contains this. |
| `--search-notes <text>` | only people whose private notes contain this text. |

### `max contacts show`

one person and the chats you share with them

```sh
max contacts show <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |

| Опция | Что делает |
|---|---|
| `--with-notes` | include your private notes, subject to contacts.notes.list permission. |

### `max contacts profile`

everything the messenger says about one person — handles, flags, last seen, when they registered — and how many of their messages the store holds in each chat you share, the first and the last, and the earlier names and usernames the store saw them with

```sh
max contacts profile <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |

| Опция | Что делает |
|---|---|
| `--show-phone` | print the whole phone number. |

### `max contacts alias`

a private local display name in the selected account

#### `max contacts alias set`



**Меняет что-то только на этом компьютере.**

```sh
max contacts alias set <person> <alias>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |
| `alias` | обязательный |  |

#### `max contacts alias rm`



**Меняет что-то только на этом компьютере.**

```sh
max contacts alias rm <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |

### `max contacts notes`

your private notes on a stored contact, the same in every account that sees them

#### `max contacts notes list`



```sh
max contacts notes list <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |

#### `max contacts notes show`



```sh
max contacts notes show <person> <id>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |
| `id` | обязательный |  |

#### `max contacts notes add`



**Меняет что-то только на этом компьютере.**

```sh
max contacts notes add <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--file <path>` | read note text from a file; omitted or - reads stdin. |

#### `max contacts notes edit`



**Меняет что-то только на этом компьютере.**

```sh
max contacts notes edit <person> <id> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |
| `id` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--file <path>` | read note text from a file; omitted or - reads stdin. |
| `--revision <number>` | the revision you read before editing. |

#### `max contacts notes remove`



**Меняет что-то только на этом компьютере.**

```sh
max contacts notes remove <person> <id>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный |  |
| `id` | обязательный |  |

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

rename the contact in the messenger address book; use contacts alias for a private local name

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

### `max contacts context`

what the store holds about one person, in every messenger linked to them: shared chats, the last messages each way, their recent messages, where others mentioned them — never connects

```sh
max contacts context <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | at most this many messages in each list; 10 if not given. |
| `--since-time <time>` | nothing older than this ISO 8601 time, or 2h / 1d ago. |
| `--chat <chat>` | a chat, by id or name; repeat it for more — then their newest messages in each, 20 unless --limit, short unless -v. |
| `--refresh` | with --chat, read their newest messages in each from the messenger first. |

### `max contacts check`

whether one person looks like a bot, a fake or a spammer: their profile and what they wrote in the store — a hint, never a verdict; the public ban lists cover Telegram only, so nothing is sent

```sh
max contacts check <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |

| Опция | Что делает |
|---|---|
| `--no-registries` | do not ask the public ban lists; nothing about them leaves this machine. |

### `max contacts link`

record that two people in the store are one person — the same name is never enough

```sh
max contacts link <person> <other>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name. |
| `other` | обязательный | the same in another messenger of the store, as <messenger>:<person> — max:Ana. |

### `max contacts unlink`

undo contacts link for one identity: it is a person of its own again

```sh
max contacts unlink <person>
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | their id, @username, or part of their name; <messenger>:<person> for another messenger. |

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

search the local store and the messenger's server (--backend); optionally fetches new messages with --sync-first

```sh
max messages search [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | strict Lucene query: words, "phrases", AND/OR/NOT, field groups and date ranges; --language legacy keeps discovery; with --saved, more words AND-ed to it. |

| Опция | Что делает |
|---|---|
| `--sync-first` | first fetch new messages within the chat, time and message bounds. |
| `--max-chats <n>` | refresh at most this many chats (default: 5). |
| `--sync-time <duration>` | stop fetching after this long (default: 30s). |
| `--max-messages <n>` | fetch at most this many messages total (default: 500). |
| `--thread` | the stored reply chain and replies instead of time neighbours; falls back when no graph exists. |
| `--thread-hops <n>` | at most this many links from the hit (default: 8). |
| `--thread-messages <n>` | at most this many messages in each thread context (default: 50). |
| `--thread-bytes <n>` | at most this many bytes of whole messages and links in each context (default: 65536). |
| `--thread-within <duration>` | messages within this long either side of the hit (default: 1d). |
| `--backend <archive\|server\|both>` | where to search: the local archive, the messenger's server, or both (default: both). |
| `--server-time <duration>` | stop waiting for the server after this long (default: 5s). |
| `--chat <chat>` | only this chat — the same as chat: in the query; a chat: its id, or part of its title. |
| `--source <messenger>` | every account of this messenger held in the store; personal, bots or all — the same as in: in the query. |
| `--limit <n>` | how many. |
| `--newest` | newest first instead of best first. |
| `--exact` | bare words and quotes match their exact form only, as exact:word does; text: still matches every form. |
| `--context <n>` | messages before and after each hit; 2 in the terminal, 0 otherwise. |
| `--language <lucene\|legacy>` | the query language: strict Lucene or legacy discovery. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--regex` | the words are one regular expression, case-insensitive, tested against every stored text. |
| `--saved <name\|id>` | run a saved search or an earlier run; options typed here replace its own. |

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
| `--thread` | the stored reply chain and replies instead of time neighbours; falls back when no graph exists. |
| `--thread-hops <n>` | at most this many links from the hit (default: 8). |
| `--thread-messages <n>` | at most this many messages in each thread context (default: 50). |
| `--thread-bytes <n>` | at most this many bytes of whole messages and links in each context (default: 65536). |
| `--thread-within <duration>` | messages within this long either side of the hit (default: 1d). |
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

### `max messages link`

a message permalink when supported, and its account-scoped locator

```sh
max messages link <chat> [message]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title; or a msg: locator, with no message id after it. |
| `message` | необязательный | the message id. |

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
| `--extract` | read text layers from the files this download maps into the local content index. |
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
| `--send-as <id>` | post as one of the identities `chats send-as` lists; required where the chat posts as someone else by default. |
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
| `--sticker <id>` | send this sticker, alone; `stickers list` finds its id. |

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
| `--send-as <id>` | post as one of the identities `chats send-as` lists for the --to chat; required where the chat posts as someone else by default. |
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

### `max messages press`

press a bot's button under a message; the bot sees that you pressed it

**Меняет что-то в MAX.**

```sh
max messages press <chat> <message> <button>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | the id of the message with the buttons. |
| `button` | обязательный | its number as `messages show` prints it, or its exact text. |

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

fetch a chat's history into the local store, newest first; run it again to continue; --all fetches every chat

```sh
max store fetch [chat] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | необязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--all` | every chat, most recently active first — what search needs; the last 90d unless --since-time or --last. |
| `--limit <n>` | at most this many messages in this run, per chat with --all; 1200 if not given. |
| `--page-size <n>` | how many messages one request asks for; 30 if not given. |
| `--pause <duration>` | the least pause between pages, to stay under the provider's limits; each is up to twice that. По умолчанию: `5s`. |
| `--since-time <time>` | stop once it reaches messages older than this: ISO 8601, or 2h / 1d ago. |
| `--last <n>` | stop once the newest n messages are held. |
| `--catch-up` | prepare local search after fetch; overrides searchCatchUp. |
| `--no-catch-up` | skip local preparation after this fetch. |
| `--catch-up-chunks <n>` | at most this many local vector chunks. |
| `--catch-up-messages <n>` | skip a graph rebuild larger than this many messages. |
| `--catch-up-time <duration>` | local preparation time budget, 30s by default. |
| `--background` | run as a job that outlives this command; `store jobs show` follows it. |
| `--estimate` | only estimate how many messages, requests and minutes a full fetch would still take — from the store, no request. |

### `max store gaps`

inspect recorded interior coverage gaps and explicitly fetch them

#### `max store gaps plan`

local coverage plan; missing message ids alone do not imply missing history

```sh
max store gaps plan <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

#### `max store gaps repair`

fetch bounded interior gaps and recheck coverage; never delete unseen messages

```sh
max store gaps repair <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | total messages in this repair, 500 by default. |
| `--max-gaps <n>` | at most this many gaps, 5 by default. |
| `--repair-time <duration>` | time budget for the repair, 30s by default. По умолчанию: `30s`. |
| `--page-size <n>` | messages per provider page. |
| `--pause <duration>` | provider pause between pages. По умолчанию: `5s`. |
| `--fingerprint <hash>` | refuse if this previously inspected coverage plan changed. |
| `--catch-up` | prepare local search after repair; overrides searchCatchUp. |
| `--no-catch-up` | skip local search preparation after repair. |
| `--catch-up-chunks <n>` | maximum local chunks prepared. |
| `--catch-up-messages <n>` | maximum stored messages read for preparation. |
| `--catch-up-time <duration>` | preparation time within the repair's remaining budget. |
| `--background` | repair as an existing store job; inspect store jobs show. |

### `max store jobs`

background fetch jobs

#### `max store jobs list`

background fetch jobs, newest first

```sh
max store jobs list [options]
```

| Опция | Что делает |
|---|---|
| `--state <state>` | only jobs in this state. Одно из: `running`, `done`, `failed`, `cancelled`, `died`. |

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

#### `max store jobs retry`

start a failed or died job again, as a new job; the fetch resumes where the store stopped

```sh
max store jobs retry [job] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `job` | необязательный | the job id. |

| Опция | Что делает |
|---|---|
| `--failed` | every chat whose newest job failed or died. |

#### `max store jobs clear`

forget finished jobs and remove their logs; a running job is kept

**Меняет что-то только на этом компьютере.**

```sh
max store jobs clear
```

### `max store export`

a chat's stored messages as JSON lines, oldest first; never asks the messenger

```sh
max store export [chats] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chats` | необязательный | a chat: its id, or part of its title; several with --to. |

| Опция | Что делает |
|---|---|
| `--format <format>` | jsonl (the default): one message per line; markdown: a transcript with a heading per day, replies and forwards quoted. |
| `--since-time <time>` | only from this ISO 8601 time, or 30m / 2h / 1d ago, on. |
| `--output <file>` | write JSON lines, or the transcript, to this new file, readable only by you. |
| `--to <dir>` | write into this folder, a file per chat and a manifest; run again on it for only what changed since. |
| `--kind <kinds>` | with --to: every stored chat of these kinds, comma-separated: dialog, group, channel, saved. |
| `--all` | with --to: every stored chat of this account. |
| `--encrypt` | compress and encrypt with a password, typed at a hidden prompt or piped on stdin; it is never kept — lose it and the file cannot be opened. |

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

bring the store up to this build's schema, then normalize, index and stem the messages and notes stored before it

```sh
max store migrate
```

### `max store reindex`

rebuild the word index, its typo vocabulary, the stems, the files' word index and the notes' indexes from what is stored; loses nothing

```sh
max store reindex
```

### `max store backup`

copy the store into a new file, while it is in use; never overwrites a file

```sh
max store backup <file> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | the new file. |

| Опция | Что делает |
|---|---|
| `--encrypt` | compress and encrypt with a password, typed at a hidden prompt or piped on stdin; it is never kept — lose it and the file cannot be opened. |

### `max store restore`

put a backup in place of the store; the store it replaces is kept beside it, never deleted

```sh
max store restore <file>
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | a file `store backup` wrote; one written with --encrypt asks for its password. |

### `max store decrypt`

open a file written with --encrypt into a new file; asks for its password

```sh
max store decrypt <file> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `file` | обязательный | a file `store backup --encrypt` or `store export --encrypt` wrote. |

| Опция | Что делает |
|---|---|
| `--output <file>` | the new file, readable only by you. |

### `max store repair`

bring every table to this build's shape, deleting nothing: a table of the wrong shape is kept as a copy beside a new one

```sh
max store repair [options]
```

| Опция | Что делает |
|---|---|
| `--dry-run` | say what it would do, and change nothing. |

### `max store copies`

the tables `store repair` kept as copies

#### `max store copies delete`

delete one copy `store repair` kept, named exactly; refuses any other table

```sh
max store copies delete <name>
```

| Аргумент | | Что это |
|---|---|---|
| `name` | обязательный | the copy's name, as `store repair` printed it. |

## `max stats`

statistics about messages, chats and their authors

### `max stats messages`

message statistics from the local store

#### `max stats messages show`

how many stored messages match, by chat, sender, day or hour — the local store only; optionally fetches new messages with --sync-first

```sh
max stats messages show [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query, as for messages search; none counts every stored message; with --saved, more words AND-ed to it. |

| Опция | Что делает |
|---|---|
| `--sync-first` | first fetch new messages within the chat, time and message bounds. |
| `--max-chats <n>` | refresh at most this many chats (default: 5). |
| `--sync-time <duration>` | stop fetching after this long (default: 30s). |
| `--max-messages <n>` | fetch at most this many messages total (default: 500). |
| `--by <chat\|sender\|day\|hour>` | what to count by (default: chat). |
| `--chat <chat>` | only this chat — the same as chat: in the query; a chat: its id, or part of its title. |
| `--source <messenger>` | every account of this messenger held in the store; personal, bots or all — the same as in: in the query. |
| `--limit <n>` | how many rows. |
| `--timezone <zone>` | the IANA timezone for calendar days and hours. |
| `--exact` | bare words and quotes match their exact form only, as exact:word does; text: still matches every form. |
| `--saved <name\|id>` | count what a saved search or an earlier run matches; options typed here replace its own. |

#### `max stats messages counters`

per-counter observations and bounded remote refresh

#### `max stats messages counters show`

show saved counter values and their observation freshness

```sh
max stats messages counters show [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | strict Lucene query over stored messages. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | held accounts of this messenger; refresh uses the active account. |
| `--exact` | bare words match exact forms. |
| `--timezone <zone>` | IANA timezone for query dates. |
| `--selection <json>` | pinned counter-targets selection from counters show; conflicts with query and scope. |
| `--counters <names>` | distinct views,reactions,comments fields; all three by default. |
| `--limit <n>` | messages, 1–100; 20 by default. |
| `--max-age <duration>` | maximum fresh observation age; 24h by default. |

#### `max stats messages counters refresh`

read authoritative counters for bounded messages and update their local observations

**Меняет что-то только на этом компьютере.**

```sh
max stats messages counters refresh [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | strict Lucene query over stored messages. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | held accounts of this messenger; refresh uses the active account. |
| `--exact` | bare words match exact forms. |
| `--timezone <zone>` | IANA timezone for query dates. |
| `--selection <json>` | pinned counter-targets selection from counters show; conflicts with query and scope. |
| `--counters <names>` | distinct views,reactions,comments fields; all three by default. |
| `--limit <n>` | messages, 1–100; 20 by default. |
| `--max-messages <n>` | maximum messages to refresh, 1–100. |
| `--sync-time <duration>` | remote refresh budget; 30s by default, maximum 5m. |
| `--dry-run` | preview exact stored targets and counter capabilities without connecting. |

#### `max stats messages unanswered`

oldest detected questions without an observed qualifying explicit reply

```sh
max stats messages unanswered [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query; none selects every stored message. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | every held account of this messenger; personal, bots or all. |
| `--exact` | bare words match exact forms rather than stems. |
| `--saved <name\|id>` | run a saved report of this kind; typed report options replace stored options. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--limit <n>` | report rows, 1–100; 20 if not given. |
| `--answerer <person>` | stored name, alias, @username, ID or person:provider/account/id; ambiguous names require a choice; repeat for more. |
| `--older-than <duration>` | minimum age of a question without an observed qualifying answer. |

#### `max stats messages discussion`

viewed posts with little recorded discussion

```sh
max stats messages discussion [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query; none selects every stored message. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | every held account of this messenger; personal, bots or all. |
| `--exact` | bare words match exact forms rather than stems. |
| `--saved <name\|id>` | run a saved report of this kind; typed report options replace stored options. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--limit <n>` | report rows, 1–100; 20 if not given. |
| `--min-views <n>` | minimum known cumulative views. |
| `--max-replies <n>` | maximum observed discussion replies. |

#### `max stats messages top`

rank stored messages by a measure or explainable score; counters are snapshots with per-field observation freshness

```sh
max stats messages top [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query; none selects every stored message. |

| Опция | Что делает |
|---|---|
| `--sync-first` | first fetch new messages within the chat, time and message bounds. |
| `--max-chats <n>` | refresh at most this many chats (default: 5). |
| `--sync-time <duration>` | stop fetching after this long (default: 30s). |
| `--max-messages <n>` | fetch at most this many messages total (default: 500). |
| `--measure <name>` | the ranking metric; not with score or weights. Одно из: `views`, `reactions`, `forwards`, `comments`, `replies`, `thread-size`. |
| `--score <preset>` | helpful/active for authors; engaging for either target. Одно из: `helpful`, `active`, `engaging`. |
| `--weights <json>` | the complete component weights; replaces preset weights. |
| `--message-kind <kind>` | select proven all, posts or comments before ranking. Одно из: `all`, `posts`, `comments`. |
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | every held account of this messenger; personal, bots or all. |
| `--timezone <zone>` | the IANA timezone for dates and active days. |
| `--exact` | bare words match exact forms rather than stems. |
| `--limit <n>` | ranked rows, 1–100. |
| `--saved <name\|id>` | run a saved query or ranking run; typed options replace stored options. |

#### `max stats messages evidence`

bounded messages, answer pairs or retention members from an exact drilldown selection

```sh
max stats messages evidence <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный | the canonical message locator, or retention cohort reference, from drilldown. |

| Опция | Что делает |
|---|---|
| `--selection <json>` | the resolved ranking selection returned in drilldown. |
| `--component <name>` | the exposed ranking component. |
| `--limit <n>` | evidence rows, 1–100; 20 if not given. |
| `--cursor <cursor>` | continue the same component and stored-evidence fingerprint. |

### `max stats contacts`

statistics about human authors

#### `max stats contacts responses`

counts and median/p90 latency for selected human answering identities

```sh
max stats contacts responses [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query; none selects every stored message. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | every held account of this messenger; personal, bots or all. |
| `--exact` | bare words match exact forms rather than stems. |
| `--saved <name\|id>` | run a saved report of this kind; typed report options replace stored options. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--limit <n>` | report rows, 1–100; 20 if not given. |
| `--answerer <person>` | stored name, alias, @username, ID or person:provider/account/id; ambiguous names require a choice; repeat for more. |

#### `max stats contacts top`

rank the human authors of stored messages by a measure or explainable score; counters are snapshots with per-field observation freshness

```sh
max stats contacts top [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `query` | необязательный | a strict Lucene query; none selects every stored message. |

| Опция | Что делает |
|---|---|
| `--sync-first` | first fetch new messages within the chat, time and message bounds. |
| `--max-chats <n>` | refresh at most this many chats (default: 5). |
| `--sync-time <duration>` | stop fetching after this long (default: 30s). |
| `--max-messages <n>` | fetch at most this many messages total (default: 500). |
| `--measure <name>` | the ranking metric; not with score or weights. Одно из: `messages`, `words`, `reactions`, `replies`, `answers`, `answer-time`, `threads`, `active-days`. |
| `--score <preset>` | helpful/active for authors; engaging for either target. Одно из: `helpful`, `active`, `engaging`. |
| `--weights <json>` | the complete component weights; replaces preset weights. |
| `--message-kind <kind>` | select proven all, posts or comments before ranking. Одно из: `all`, `posts`, `comments`. |
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--source <messenger>` | every held account of this messenger; personal, bots or all. |
| `--timezone <zone>` | the IANA timezone for dates and active days. |
| `--exact` | bare words match exact forms rather than stems. |
| `--limit <n>` | ranked rows, 1–100. |
| `--saved <name\|id>` | run a saved query or ranking run; typed options replace stored options. |
| `--min-messages <n>` | minimum selected messages per author; 1, or 5 for engaging. |

#### `max stats contacts evidence`

bounded messages, answer pairs or retention members from an exact drilldown selection

```sh
max stats contacts evidence <person> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `person` | обязательный | the exact native person id from the ranking row. |

| Опция | Что делает |
|---|---|
| `--selection <json>` | the resolved ranking selection returned in drilldown. |
| `--component <name>` | the exposed ranking component. |
| `--limit <n>` | evidence rows, 1–100; 20 if not given. |
| `--cursor <cursor>` | continue the same component and stored-evidence fingerprint. |

### `max stats chats`

statistics about one chat

#### `max stats chats show`

a group's or channel's numbers for a period: messages, active members, replies, reactions, questions answered, joins and leaves — counted from the local store; joins and leaves are asked of the messenger

```sh
max stats chats show <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | ISO 8601, or 2h / 1d ago; 7 days ago if not given. |
| `--by <day\|week>` | also one row per calendar day or week (weeks start on Monday). |
| `--timezone <zone>` | the IANA timezone for calendar days. |

#### `max stats chats newcomers`

known-join members and their help within a join window

```sh
max stats chats newcomers <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | from this ISO 8601 time, or 2h / 1d ago; 30d ago if not given. |
| `--until-time <time>` | through this ISO 8601 time, or 2h / 1d ago. |
| `--within <duration>` | the help window after a known newcomer join. |
| `--saved <name\|id>` | run a saved report of this kind; typed report options replace stored options. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--limit <n>` | report rows, 1–100; 20 if not given. |
| `--answerer <person>` | stored name, alias, @username, ID or person:provider/account/id; ambiguous names require a choice; repeat for more. |

#### `max stats chats retention`

joining cohorts and observed checkpoint membership from saved roster observations

```sh
max stats chats retention <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | joining period starts at ISO 8601 or a relative time; last 90 days by default. |
| `--until-time <time>` | joining period ends at this time; now by default. |
| `--checkpoints <durations>` | up to 10 increasing joining ages, comma separated; 1d,7d,30d by default. |
| `--within <duration>` | activity and early departure window after joining; 7d by default. |
| `--by <day\|week>` | group joining dates by calendar day or Monday week. Одно из: `day`, `week`. |
| `--timezone <zone>` | IANA timezone for joining cohorts. |
| `--limit <n>` | cohorts and member evidence, 1–100. |

### `max stats tasks`

task statistics

#### `max stats tasks show`

per chat: how many tasks are open, the oldest open one, the median time to close

```sh
max stats tasks show [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat; a chat: its id, or part of its title. |
| `--type <name>` | only this type: question, request, mention or promise. |

### `max stats charts`

a chart's data from a chat's statistics, and optionally a dark SVG or PNG image

```sh
max stats charts <chat> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |

| Опция | Что делает |
|---|---|
| `--chart-kind <messages\|active\|membership>` | what to draw: messages, active authors, or joins and leaves. По умолчанию: `messages`. |
| `--by <day\|week>` | one point per calendar day or week (weeks start on Monday). По умолчанию: `day`. |
| `--since-time <time>` | ISO 8601, or 2h / 1d ago; 7 days ago if not given. |
| `--timezone <zone>` | the IANA timezone for calendar days. |
| `--output <file>` | write a dark image to a new .svg or .png file. |

## `max tasks`

what waits on you — unanswered questions, mentions, requests, promises — kept in the local store; review and serve add them

### `max tasks list`

tasks, oldest first, with the message each points at

```sh
max tasks list [options]
```

| Опция | Что делает |
|---|---|
| `--state <state>` | only tasks in this state: open, done or dismissed. |
| `--chat <chat>` | only this chat's tasks; a chat: its id, or part of its title. |
| `--type <names>` | only these types, comma-separated: question, request, mention, promise. |
| `--before-time <time>` | only tasks opened before this ISO 8601 time, or 2h / 1d ago. |
| `--limit <n>` | how many. |

### `max tasks add`

add a task for a message the rules cannot see — a promise, a request

```sh
max tasks add <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный | a message locator, msg:<provider>/<account>/<chat>/<message>, as review --json shows. |

| Опция | Что делает |
|---|---|
| `--type <name>` | the task's type: question, request, mention or promise. |

### `max tasks close`

close a task: done, or dismissed when it needs no answer; a closed task stays closed

```sh
max tasks close <task> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `task` | обязательный | the task's id, as tasks list shows it. |

| Опция | Что делает |
|---|---|
| `--as <state>` | how it is closed: done, or dismissed — it needs no answer. |
| `--reason <text>` | why, kept with the task — no-reply-needed, for example. |

## `max conversations`

the conversations inside a chat, found in the stored messages by replies, mentions and who wrote next

### `max conversations build`

find a chat's conversations in what the store holds, replacing the last build; without --chat, every chat that changed since its build and every group never built; never asks the messenger

```sh
max conversations build [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--analyze` | link batches using the configured analysis provider; requires --chat and remembers consent for this chat/provider. |
| `--provider <provider>` | analysis: agent, openai or anthropic. |
| `--model <model>` | analysis model; overrides analysisModel. |
| `--base-url <url>` | analysis API endpoint; overrides analysisBaseUrl. |
| `--size <n>` | analysis answer messages per batch, 10–200; default 50. |
| `--max-tokens <n>` | analysis input/output reservation cap per run; default 100000. |
| `--max-chats <n>` | at most this many chats in one run; 20 if not given. |

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

### `max conversations related`

the conversations nearest in meaning to the one a message is in, in every built chat, best first — from the vectors `conversations embed` stored; runs no model

```sh
max conversations related <chat> <message> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title. |
| `message` | обязательный | a message id in that chat. |

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |

### `max conversations status`

how fresh each built chat's conversations and vectors are: messages the build has not seen, chunks with a current, stale or missing vector

```sh
max conversations status [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat: a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |

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
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |
| `--max-chats <n>` | at most this many chats; 5 with --sync-first, 20 with --refresh if not given. |
| `--max-chunks <n>` | at most this many chunks embedded in one run; 2000 if not given. |
| `--sync-first` | first fetch new messages within the chat, time and message bounds. |
| `--sync-time <duration>` | stop fetching after this long (default: 30s). |
| `--max-messages <n>` | fetch at most this many messages total (default: 500). |
| `--chat <chat>` | only this chat: a chat: its id, or part of its title. |
| `--since-time <time>` | only those still going at this ISO 8601 time, or 30m / 2h / 1d ago, or later. |
| `--filter <query>` | strict Lucene filter: any message in a conversation must match; does not change the meaning query. |
| `--source <source>` | accounts to search: personal, bots, all, or a provider; defaults to the active account. |
| `--timezone <zone>` | IANA timezone for filter dates; system timezone by default. |
| `--limit <n>` | how many. |
| `--refresh` | first build and embed, on this machine, the chats in scope that changed or were never built — within --max-chats and --max-chunks. |

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

### `max conversations consents`

remembered analysis permissions for this account's chats and provider endpoints

#### `max conversations consents list`



```sh
max conversations consents list
```

#### `max conversations consents revoke`



```sh
max conversations consents revoke [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | revoke only this chat's consents; defaults to every chat. |
| `--provider <identity>` | exact provider identity from consents list; defaults to every provider. |

### `max conversations embed`

compute a vector for each chunk of a chat's conversations for search by meaning — on this machine, or with --provider through a service and your key; resumes where it stopped; without --chat, every built chat with chunks left, on this machine only

```sh
max conversations embed [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |
| `--workers <n>` | local: sessions in parallel, each with its own copy of the model (\~0.7 GB each). |
| `--threads <n>` | local: threads in all (default: min(8, cores)). |
| `--concurrency <n>` | remote: requests at once (default: 4). |
| `--max-tokens <n>` | remote: stop before a run that could send more tokens than this. |
| `--max-chats <n>` | at most this many chats in one run; 20 if not given. |
| `--max-chunks <n>` | at most this many chunks embedded in one run; 2000 if not given, and no limit with --chat. |

#### `max conversations embed status`

how many chunks of a chat have a vector of the model, how many are left, and what is left costs

```sh
max conversations embed status [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a chat: its id, or part of its title. |
| `--model <model>` | local: a model id from `models text list` (default: e5-small); remote: the provider's model. |
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
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
| `--provider <provider>` | embedding provider: local or openai; flags override profile settings. |
| `--base-url <url>` | a server with OpenAI's /v1/embeddings: Gemini, Jina, or Ollama and LM Studio on this machine. |
| `--dims <n>` | remote: the vector size — needed with --base-url; shortens an OpenAI model's. |

## `max attachments`

the files of stored messages: their text in the local store, for content: in a search

### `max attachments extract`

read the text of downloaded files — text, PDF/DOCX text layers, ODT/ODS/XLSX/PPTX/EPUB — into the local store, for content: in a search

```sh
max attachments extract [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat's files; a chat: its id, or part of its title. |
| `--from-dir <dir>` | match files in this nonrecursive directory; needs --chat. |
| `--cursor <cursor>` | continue from the cursor returned by a bounded extraction. |
| `--download` | first save the files no download saved yet, from the messenger, into --output-dir. |
| `--output-dir <dir>` | with --download, where to save them; created if missing. |
| `--limit <n>` | read at most this many files; run it again to continue. |
| `--ocr` | explicitly call models.ocr for bulk image and scanned-PDF text extraction. |
| `--concurrency <n>` | remote: requests at once (default: 4). |

### `max attachments list`

files of stored messages, where each was saved and whether its text is held — never the text

```sh
max attachments list [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat's files; a chat: its id, or part of its title. |
| `--needs-text` | only files saved here whose text nobody has yet: what an agent reads and writes back. |
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--all` | every row, no paging. |

### `max attachments show`

read a bounded chunk of one retained attachment; JSON includes base64 bytes

```sh
max attachments show <chat> [message] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title; or a msg: locator alone. |
| `message` | необязательный | the message id. |

| Опция | Что делает |
|---|---|
| `--attachment <n>` | file position from 1; required for several files. |
| `--offset-bytes <n>` | byte offset from 0. |
| `--chunk-bytes <n>` | bytes to return, 1–1048576 (default524288). |
| `--if-sha256 <hash>` | require the whole file SHA-256 from the preceding chunk. |

### `max attachments text`

the text of one file, as an agent read it

#### `max attachments text set`

keep the text an agent read from a file — a scan, a photo — so content: finds it; nothing is sent

```sh
max attachments text set <chat> [message] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | a chat: its id, or part of its title; or a msg: locator, with no message id after it. |
| `message` | необязательный | the message id. |

| Опция | Что делает |
|---|---|
| `--attachment <n>` | which file of the message, from 1; needed when it has more than one. |
| `--text-file <path>` | read the text from this file; - or none reads stdin. |

## `max tags`

your own labels on chats, people and messages, kept in the local store and never sent; tag: in a search finds them

### `max tags auto`

derive local group/channel tags from cached metadata using keyword rules

**Меняет что-то только на этом компьютере.**

```sh
max tags auto [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a stored group/channel; repeat to select several. По умолчанию: ``. |
| `--limit <number>` | process at most 1–500 chats. По умолчанию: `50`. |
| `--refresh-metadata` | read current descriptions from the messenger before classifying. |
| `--dry-run` | preview cached classification without changing the store. |

### `max tags add`

put tags on one chat, person or message

**Меняет что-то только на этом компьютере.**

```sh
max tags add <tag> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `tag` | обязательный | one or more tags: 1–32 letters a–z, digits and hyphens; upper case is lowered. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | the chat to tag, or the chat of --message; a chat: its id, or part of its title. |
| `--contact <person>` | the person to tag: their id, @username or name, as the local store knows them. |
| `--message <message>` | the message to tag: its id in --chat, or a msg: locator alone. |

### `max tags remove`

take tags off one chat, person or message

**Меняет что-то только на этом компьютере.**

```sh
max tags remove <tag> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `tag` | обязательный | one or more tags: 1–32 letters a–z, digits and hyphens; upper case is lowered. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | the chat to untag, or the chat of --message; a chat: its id, or part of its title. |
| `--contact <person>` | the person to untag: their id, @username or name, as the local store knows them. |
| `--message <message>` | the message to untag: its id in --chat, or a msg: locator alone. |
| `--source <manual\|auto>` | remove only this ownership claim. |

### `max tags list`

what is tagged: this account's chats and messages, and the people of its messenger

```sh
max tags list [options]
```

| Опция | Что делает |
|---|---|
| `--tag <tag>` | only this tag. |
| `--source <manual\|auto>` | only labels with this ownership claim. |
| `--type <names>` | only what is tagged of this type: chat, contact or message. |

## `max metadata`

cached group/channel descriptions for local automatic tags

### `max metadata get`



```sh
max metadata get [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | a stored chat. |

### `max metadata refresh`



**Меняет что-то только на этом компьютере.**

```sh
max metadata refresh [options]
```

| Опция | Что делает |
|---|---|
| `--chat <chat>` | stored group/channel; repeat for several. По умолчанию: ``. |
| `--only-missing` | only chats with no metadata yet; without --chat, every stored group/channel. |
| `--limit <number>` | process at most 1–500 chats. По умолчанию: `50`. |

## `max searches`

saved searches and the history of messages search and stats messages show, kept in the local store; --saved runs one

### `max searches create`

save a search under a name without running it; messages search --saved <name> runs it

```sh
max searches create <name> [query] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `name` | обязательный | up to 64 letters a–z, digits and hyphens, not only digits. |
| `query` | необязательный | the query, as for messages search; none matches every stored message. |

| Опция | Что делает |
|---|---|
| `--chat <chat>` | only this chat — the same as chat: in the query; a chat: its id, or part of its title. |
| `--source <messenger>` | every account of this messenger held in the store; personal, bots or all — the same as in: in the query. |
| `--limit <n>` | how many. |
| `--newest` | newest first instead of best first. |
| `--exact` | bare words and quotes match their exact form only, as exact:word does; text: still matches every form. |
| `--context <n>` | messages before and after each hit. |
| `--language <lucene\|legacy>` | the query language: strict Lucene or legacy discovery. |
| `--timezone <zone>` | the IANA timezone for calendar date boundaries. |
| `--regex` | the words are one regular expression, case-insensitive, tested against every stored text. |
| `--by <chat\|sender\|day\|hour>` | what stats messages show --saved counts by. |
| `--selection <json>` | save the resolved parent ranking query and options from a drilldown. |
| `--replace` | overwrite a saved search of the same name. |

### `max searches show`

one saved search or earlier run: its query, options and how often it ran

```sh
max searches show <name|id>
```

| Аргумент | | Что это |
|---|---|---|
| `name\|id` | обязательный | a saved search's name, or the id of any row of searches history. |

### `max searches list`

the saved searches, by name

```sh
max searches list
```

### `max searches history`

the searches and counts that ran, newest first — saved ones included; never their results

```sh
max searches history [options]
```

| Опция | Что делает |
|---|---|
| `--limit <n>` | how many. |

### `max searches delete`

delete a saved search, or one run from the history

```sh
max searches delete <name|id>
```

| Аргумент | | Что это |
|---|---|---|
| `name\|id` | обязательный | a saved search's name, or the id of any row of searches history. |

### `max searches clear`

empty the history; saved searches stay

```sh
max searches clear
```

## `max flood`

the waits MAX asked this profile to keep, and a hold on its writes

### `max flood clear`

forget them, lift the hold and the profile's pace, once MAX no longer limits the account; changes nothing there

```sh
max flood clear
```

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

API keys for embedding and analysis providers

#### `max models text key set`

store a key, typed at a hidden prompt or piped on stdin — never as an argument

```sh
max models text key set <provider>
```

| Аргумент | | Что это |
|---|---|---|
| `provider` | обязательный | openai, anthropic, or the host of a --base-url server that wants a key. |

#### `max models text key remove`

forget a stored key

```sh
max models text key remove <provider>
```

| Аргумент | | Что это |
|---|---|---|
| `provider` | обязательный | openai, anthropic, or a server's host. |

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
| `--send-as <id>` | post as one of the identities `chats send-as` lists; required where the chat posts as someone else by default. |
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
| `--kind <kinds>` | only chats of these kinds, comma-separated: dialog, group, channel, saved. |
| `--transcribe` | turn voice messages not heard yet into text — by the messenger, or a model on this machine; can take minutes. |
| `--model <id>` | which downloaded speech model hears them, with --transcribe; `models audio list` shows them. |
| `--mark-read` | also mark each chat shown read, up to the newest message shown; the other side sees it. |
| `--no-mark-read` | do not, whatever the catchUpMarksRead setting says. |

## `max review`

every message, yours too, in chats that changed since a point — for reviewing who owes what

```sh
max review [options]
```

| Опция | Что делает |
|---|---|
| `--since-time <time>` | where the last review ended — ISO 8601, or 2h / 1d ago; 3 days ago if not given. |
| `--chat <chat>` | only this chat: a chat: its id, or part of its title. |
| `--kind <kinds>` | only chats of these kinds, comma-separated: dialog, group, channel, saved. |
| `--unanswered [duration]` | only questions to you or a group's admins that nobody answered, asked at least this long ago — 4h, 1d; 24h if not given. |
| `--all` | muted and archived chats too — left out unless they mention you or reply to you. |
| `--transcribe` | turn voice messages not heard yet into text — by the messenger, or a model on this machine; can take minutes. |
| `--model <id>` | which downloaded speech model hears them, with --transcribe; `models audio list` shows them. |
| `--new` | what changed since the last `review --new`, a point per chat — for scheduled runs. |
| `--mark-read` | also mark each chat shown read, up to the newest message shown; the other side sees it. |
| `--no-mark-read` | do not, whatever the catchUpMarksRead setting says. |

## `max replies`

rules that answer messages for you, kept in a file of this profile

### `max replies add`

add a rule with every default written out, off until you edit and enable it

**Меняет что-то только на этом компьютере.**

```sh
max replies add <id>
```

| Аргумент | | Что это |
|---|---|---|
| `id` | обязательный | lower-case letters, digits and -; unique in this profile. |

### `max replies on`

enable one reply rule; its template must be ready

**Меняет что-то только на этом компьютере.**

```sh
max replies on <id>
```

| Аргумент | | Что это |
|---|---|---|
| `id` | обязательный | the rule's id. |

### `max replies off`

disable one reply rule

**Меняет что-то только на этом компьютере.**

```sh
max replies off <id>
```

| Аргумент | | Что это |
|---|---|---|
| `id` | обязательный | the rule's id. |

### `max replies edit`

change only the named fields of a reply rule; lists replace the whole list

**Меняет что-то только на этом компьютере.**

```sh
max replies edit <id> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `id` | обязательный | the rule's id. |

| Опция | Что делает |
|---|---|
| `--do <actions>` | actions: reply, task, or both, comma-separated. |
| `--kinds <kinds>` | chat kinds: dialog, group; comma-separated, empty for any. |
| `--chats <ids>` | only these chat ids, comma-separated; empty for any. |
| `--not-chats <ids>` | leave these chat ids out, comma-separated; empty clears. |
| `--words <words>` | match any of these whole words, comma-separated; empty clears. |
| `--question` | match only questions. |
| `--no-question` | do not require a question. |
| `--mentions-me` | require a mention of you or a reply to you. |
| `--no-mentions-me` | do not require a mention of you or a reply to you. |
| `--people <ids>` | only these sender ids, comma-separated; empty for any. |
| `--not-people <ids>` | leave these sender ids out, comma-separated; empty clears. |
| `--contacts-only` | match only contacts. |
| `--no-contacts-only` | do not require a contact. |
| `--template <text>` | the reply template. |
| `--model <mode>` | legacy template mode: fill-only or may-reword; use ai blocks instead. |
| `--as-reply` | send as a reply to the matched message. |
| `--no-as-reply` | send without linking to the matched message. |
| `--per-chat <limit>` | at most this many per chat, such as 1/12h. |
| `--per-person <limit>` | at most this many per person, such as 1/1d. |
| `--outside <hours>` | answer outside this 24-hour window, such as 09:00-19:00. |
| `--days <days>` | days of the working window, such as mon-fri or sat,sun. |
| `--timezone <zone>` | the IANA timezone for the working window. |
| `--no-hours` | clear the working window. |

### `max replies audience`

show the profile's reply audience, or replace its named fields; testers still limit answers

**Меняет что-то только на этом компьютере.**

```sh
max replies audience [options]
```

| Опция | Что делает |
|---|---|
| `--reply <mode>` | answer all or only listed senders and chats: all, listed. |
| `--allow-people <ids>` | replace allowed sender ids, comma-separated; empty clears. |
| `--allow-chats <ids>` | replace allowed chat ids, comma-separated; empty clears. |
| `--deny-people <ids>` | replace denied sender ids, comma-separated; empty clears; deny wins. |
| `--deny-chats <ids>` | replace denied chat ids, comma-separated; empty clears; deny wins. |

### `max replies consents`

consent for reply models once per profile and endpoint, with chat opt-outs

#### `max replies consents show`

show the reply model consent and chat opt-outs; never calls a model

```sh
max replies consents show
```

#### `max replies consents grant`

allow incoming message data to go to the configured reply model for this profile; chat opt-outs remain

**Меняет что-то только на этом компьютере.**

```sh
max replies consents grant
```

#### `max replies consents revoke`

revoke the profile's reply model consent immediately; chat opt-outs remain

**Меняет что-то только на этом компьютере.**

```sh
max replies consents revoke
```

#### `max replies consents deny`

keep this chat's incoming data away from the reply model

**Меняет что-то только на этом компьютере.**

```sh
max replies consents deny <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | the native chat id, used as written; never resolved over the network. |

#### `max replies consents allow`

remove this chat's model opt-out; does not grant profile consent

**Меняет что-то только на этом компьютере.**

```sh
max replies consents allow <chat>
```

| Аргумент | | Что это |
|---|---|---|
| `chat` | обязательный | the native chat id, used as written; never resolved over the network. |

### `max replies test`

what the rules would have answered in the stored messages, to whom and why — sends nothing, changes nothing, never connects

```sh
max replies test [rule] [options]
```

| Аргумент | | Что это |
|---|---|---|
| `rule` | необязательный | only this rule, by its id; every rule in file order if not given. |

| Опция | Что делает |
|---|---|
| `--since-time <time>` | from this ISO 8601 time, or 2h / 1d ago; 7d ago if not given. |
| `--ai` | call the configured reply model with stored message data; requires reply consent, otherwise uses fallback. |

### `max replies pause`

stop every reply rule of this profile at once, a running serve too; resume undoes it

```sh
max replies pause
```

### `max replies resume`

let the reply rules answer again after pause

```sh
max replies resume
```

### `max replies status`

whether the rules may send, which are on, and who they may answer

```sh
max replies status
```

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
| `--events` | also print edits, deletions, reactions, reads and chat changes; every line then names its event. |

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

### `max config migrate`

replace legacy access settings with permissions, preserving effective levels

**Меняет что-то только на этом компьютере.**

```sh
max config migrate [options]
```

| Опция | Что делает |
|---|---|
| `--dry-run` | show the migration without writing the file. |

### `max config set`

save a setting to the configuration file

**Меняет что-то только на этом компьютере.**

```sh
max config set <setting> <value> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, permissions, sendsPerHour, requestsPerMinute, embeddingProvider, embeddingModel, embeddingBaseUrl, embeddingDims, analysisProvider, analysisModel, analysisBaseUrl, models, senderColors, catchUpMarksRead, searchCatchUp, serve, mcpTools, readOtherBots, updateCheck, skillHint, transcribeModel, defaultProfile, searchStemmers.cyrillic, searchStemmers.latin. |
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
| `setting` | обязательный | one of: limit, timeoutMs, color, record, keepRunsForDays, readOnly, allow, permissions, sendsPerHour, requestsPerMinute, embeddingProvider, embeddingModel, embeddingBaseUrl, embeddingDims, analysisProvider, analysisModel, analysisBaseUrl, models, senderColors, catchUpMarksRead, searchCatchUp, serve, mcpTools, readOtherBots, updateCheck, skillHint, transcribeModel, defaultProfile, searchStemmers.cyrillic, searchStemmers.latin. |

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

commands, options and exit codes as JSON — inspect one command path per call

### `max commands schema`

one command's argv and result schemas, effects, permissions and retry guidance

```sh
max commands schema <path>
```

| Аргумент | | Что это |
|---|---|---|
| `path` | обязательный | one command path, for example: stats messages show. |

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
| `--permission <key=level>` | override a permission for this server only; repeat for more keys. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-send` | deprecated: use permissions.messages.send in config; does not grant access. |
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-mark-read` | deprecated: use permissions.chats.mark-read in config; does not grant access. |
| `--allow-delete` | deprecated: use permissions.messages.delete in config; does not grant access. |
| `--allow-moderate` | deprecated: use permissions.chats.moderate and group rules; does not grant access. |
| `--http` | serve over HTTP on 127.0.0.1 for ChatGPT and Claude in the browser, behind your tunnel; the profile's permissions decide. |
| `--http-confirmation <mode>` | no longer used — writes show no form; the profile's permissions decide. |
| `--port <port>` | the local port for --http (default 8765). |
| `--public-url <url>` | the tunnel's https address the browser apps use, e.g. https://<name>.ts.net. |
| `--revoke` | forget every login given to a browser app; each must log in again. |

### `max mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
max mcp config [options]
```

| Опция | Что делает |
|---|---|
| `--permission <key=level>` | override a permission for this server only; repeat for more keys. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-send` | deprecated: use permissions.messages.send in config; does not grant access. |
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-mark-read` | deprecated: use permissions.chats.mark-read in config; does not grant access. |
| `--allow-delete` | deprecated: use permissions.messages.delete in config; does not grant access. |
| `--allow-moderate` | deprecated: use permissions.chats.moderate and group rules; does not grant access. |

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
| `--permission <key=level>` | override a permission for this server only; repeat for more keys. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-send` | deprecated: use permissions.messages.send in config; does not grant access. |
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-mark-read` | deprecated: use permissions.chats.mark-read in config; does not grant access. |
| `--allow-delete` | deprecated: use permissions.messages.delete in config; does not grant access. |
| `--allow-moderate` | deprecated: use permissions.chats.moderate and group rules; does not grant access. |

### `max mcp doctor`

check this profile's local MCP handshake and tool list

```sh
max mcp doctor [options]
```

| Опция | Что делает |
|---|---|
| `--permission <key=level>` | override a permission for this server only; repeat for more keys. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-send` | deprecated: use permissions.messages.send in config; does not grant access. |
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-mark-read` | deprecated: use permissions.chats.mark-read in config; does not grant access. |
| `--allow-delete` | deprecated: use permissions.messages.delete in config; does not grant access. |
| `--allow-moderate` | deprecated: use permissions.chats.moderate and group rules; does not grant access. |

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
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
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
| `--confirm-send` | no longer used — writes show no form; the profile's permissions decide. |
| `--allow-dangerous` | no longer used — writes show no form; the profile's permissions decide. |
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
max bot comments delete <message> <comment> [options]
```

| Аргумент | | Что это |
|---|---|---|
| `message` | обязательный |  |
| `comment` | обязательный |  |

| Опция | Что делает |
|---|---|
| `--allow-dangerous` | skip confirmation for bot.messages.delete at level ask. |

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
| `--allow-dangerous` | skip confirmation for bot.messages.delete at level ask. |

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
| `--allow-dangerous` | skip confirmation for bot.messages.delete at level ask. |

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
