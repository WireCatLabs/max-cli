# Conventions

How code and documents are written here. Short on purpose — the linter is the authority on
formatting, and this file only covers what a linter cannot say.

Adapted from the sibling project `braze-cli`, which is where most of these were learned. Two of
its rules are **deliberately inverted or weakened** here and are marked below; copying them
unchanged would import a constraint this project does not have.

## Code

**The linter decides formatting.** Biome settles indentation, quotes, semicolons, line width and
import order. Do not argue with it and do not hand-format around it. For the record: 2-space
indent, double quotes, no semicolons, 120 columns.

**TypeScript, strict, and no `any`.** `noUncheckedIndexedAccess` on, so an index access is
`T | undefined` and you have to handle it. `noExplicitAny` is an error, not a warning.

**Functional in the small, classes where identity matters.** A client that holds a connection and
a session is a class; everything else is a function taking its inputs.

**Comments are sparse and say *why*.** A comment earns its place by recording a decision, warning
about a trap, or naming a constraint that is invisible locally. Never narrate a change, never
leave commented-out alternatives. If it would be obvious to a competent reader of TypeScript,
delete it.

**Wire names live below the adapter; our names live above it.** ⚠ *This is the opposite of
`braze-cli`, where Braze's own field names survive into the public types unchanged.* Braze
publishes its field names and a reader has its documentation open; MAX does not and nobody does.
So a raw protocol field keeps its wire spelling inside the protocol and adapter layers, where it
has to match captured traffic — and above the adapter only our own domain model exists
(`lastMessageAt`, not whatever the frame happens to call it). A raw MAX object never reaches CLI
output except behind an explicit debug/raw option —
`docs_ai/REQUIREMENTS.md` §16, §25.

**Reusable core code stays Node-light, and this is a weaker rule than it looks.** ⚠ *`braze-cli`
requires its core to run unchanged in a Cloudflare Worker and enforces that with three gates.
That is not a requirement here.* The brief asks only for "minimal coupling to Node-specific APIs
in reusable core code **where practical**" (§2). The reason to keep `cli-core` free of Node
specifics is that it has to serve more than one CLI and be testable without a filesystem, a
terminal or a clock — not that it has to run in a Worker. Do not import the three-gate apparatus
until something actually needs it.

**Core takes its environment as arguments.** If reusable code needs to know anything about the
machine it runs on — the time, the filesystem, the keyring, the terminal, randomness — it takes
it as a parameter. That is what makes timeout, retry and session expiry testable without waiting.

**One-shot means one-shot.** Anything that opens a connection, a timer or a listener owns closing
it, in a `finally` or an equivalent lifecycle wrapper. A command that prints its result and then
hangs is a defect, not a rough edge — §18.

**Never log a credential, and never pass one to a logger "because it's redacted".** Redaction is
the second line of defence, not the first. Message bodies are not credentials, but they are not
diagnostics either: they belong in command output, never in a log — §14.

**A test must not prepare what the user lacks.** Every cache test created its directory and then
opened a database in it, so all of them passed while the feature was off on every real machine —
SQLite will not create a file under a directory that does not exist, and no machine has one the
first time. When a test sets up a path, an environment variable or a file, ask whether a first run
would have it. Audited 2026-09-20: the session state file and the credential file both create
their directories; the cache was the only one that did not.

**Failing quietly is not failing invisibly.** A component nobody asked for may decline to work
rather than break the command — and must still say why, on the diagnostic stream. A swallowed
reason cost a day: the cache looked identical whether it was working or had never opened once
(`NEED-97`).

**A file nothing checks will rot, and quietly.** `scripts/` sat outside every `tsconfig` until
2026-09-22, so three of the four probes had been broken for two days by a signature change in
`src/` and CI stayed green throughout — the compiler had never been shown them. `tsconfig.scripts.json`
now covers them. The rule generalises: when a directory is added, it is either in a project the
build checks or it is a directory that will be wrong within a month.

**Report honestly.** If a test failed, show the output. If something could not be verified, say
which thing and why. "Probably works" is a sentence you are allowed to write; a green tick you did
not earn is not.

**Say where a protocol fact came from.** This is an unofficial protocol, so every opcode, field
and shape is somebody's observation. Record whether ours is confirmed by several independent
implementations, seen in one, inferred, or a guess — §10. An unsourced constant is the thing that
will be impossible to re-derive when MAX changes.

## Command names

One standard for `max` and `tg` (`NEED-425`, 2026-09-30). A name a person reads once should say
what the command does; a name an agent reads should be guessable from the others.

1. **`<tool> [profile] <resource> <verb> [arguments]`.** The resource is a noun: **plural** for a
   collection (`chats`, `contacts`, `messages`, `polls`, `reactions`, `recipients`, `sends`,
   `runs`, `topics`, `models`), **singular** for what a profile has exactly one of (`session`,
   `account`, `config`, `server`, `store`, `skill`, `cache`). A group is never named with a verb.
2. **Top-level words** only for what spans every chat or is the tool itself: `inbox`, `review`,
   `watch`, `serve`, `doctor`, `upgrade`, `commands`, `complete`, `mcp`. A new one needs a reason
   in its pull request.
3. **Verbs come from this list, each with one meaning.** A verb not on it is added here first.
   - `list` many · `show` one · `search` find by text — the description says where it looks
   - `create` / `delete` make or destroy a thing · `add` / `remove` put an existing thing into or
     out of a set (members, admins, contacts, recipients, reactions) · `clear` empty a set
   - `update` change a thing's fields · `set` / `unset` one named key · `rename` its name only
   - `start` / `stop` / `restart` / `status` a running process · `start` / `end` a login session
     · `install` / `uninstall` a system unit · `cancel` a job
   - `fetch` from the messenger into the store · `export` from the store to a file · `import` ·
     `download` · `transcribe` · `sync` take a whole list again
   - `lookup` ask the messenger who is behind a phone number · `inspect` look at a link without
     joining it
   - the messenger's plain verbs: `send`, `edit`, `forward`, `pin`, `unpin`, `vote`, `close`,
     `join`, `leave`, `block`, `unblock`, `mark-read`, `reset` (replace; the old one stops
     working), `check` (apply a chat's rules)
   - A **noun as the last word** names a view and shows it: `server logs`, `chats events`,
     `messages scheduled`, `messages context`, `runs path`, `mcp config`.
4. **One action, one command.** A variant is an option, never a sibling command, and no command
   both shows and changes.
5. **Options are plain words, never a wire field** (`--send-id`, not `--cid`). One meaning, one
   name, in every command of both tools. **A length of time is a `<duration>`** (`500ms`,
   `30s`, `2m`), parsed as `--timeout` is; `--since` takes a duration or a time.
6. **Arguments have fixed names:** `<chat>`, `<message>`, `<person>`, `<text>`, `<link>`,
   `<file>`, `<job>`.
7. **One word per idea** in help, docs and errors. The **local store** («локальное хранилище») is
   the message database both tools share; max's per-profile **cache** is a different thing until it
   is replaced, and keeps its name until then. `session` is this tool's login; `account sessions`
   are the other devices.
8. **An MCP tool is named after its command:** `<tool>_<resource>_<verb>`, e.g. `max_store_export`.
9. **No aliases.** A renamed command's old name stops working, and the release notes say so under
   "may break scripts".

`bot api` is exempt: its names mirror the official Bot API's operations.

## Documents

The point is that six weeks from now, a person or an agent with no memory of the work can open a
doc and act on it **without reading the code first, and without being misled**. A doc that is
merely incomplete costs some time; a doc that is confidently stale costs a wrong decision.

**Say what has never been verified, at the top.** Each doc opens with a status line naming what is
built, what is measured and what rests on assumption. This costs one paragraph and is the
difference between a doc you can act on and one you have to audit.

**Separate what you saw from what you inferred.** Something you ran gets a command and its
output. Something you read in documentation is "the docs describe X" — reading docs is not
verification. For MAX this applies twice over: a claim in another project's README is not even
documentation, it is a claim, until its current source says the same thing.

**Anchor every claim.** `path/file.ts:123` for our code, a URL for anything external, a commit for
anything historical. A claim without an anchor is an opinion.

**Correct in place; never append.** A doc where the truth lives in a note at the bottom is a doc
that lies at the top. Rewrite the wrong sentence. If the wrong version circulated, mark the fix —
do not hide it.

**User pages state current facts only.** `README.md` and the Russian pages under `docs/` — the
ones [`../README.md`](../README.md) lists under "Using it", except `CHANGELOG.md` — carry no «Поправка», no struck-out text, no
dated "measured on", no decision or backlog ids. Rewrite the sentence and say nothing about the
old one; the trail lives in git, `CHANGELOG.md` and the journal. A *why* is allowed when a reader
would otherwise undo the behaviour. The marked-correction rule above is for the developer
documents.

**One fact, one home.** A decision lives in `docs_ai/DECISIONS.md`; a task lives in
[`BACKLOG.md`](BACKLOG.md); something to delete lives in `docs_ai/CLEANUP.md`; a plan lives in
`docs_ai/plans/`. Everywhere else links to it. Two copies of a fact drift, and the reader cannot
tell which is current.

**Write the trap, not the rule.** "Close the connection" is weaker than "a MAX WebSocket left open
keeps the process alive after the result has printed, so a script that pipes `max chats list --json`
never returns." The failure mode is what the reader needs to recognise.

**No inventories, no archaeology, no placeholders.** A table of every class ages instantly. How a
name was chosen is not useful; what it *is*, is. `<your-chat-id>` gets read as a literal — paste a
real value from a real run.

**Leave a section out rather than filling it with placeholder prose.** An empty heading is honest;
invented content is not. For the same reason `ARCHITECTURE.md` was written only after the code
existed: a description of something not yet built is fiction.

**A command you hand someone is a snapshot, not a template.** Never put a placeholder inside a
runnable command — in `braze-cli` a placeholder endpoint was pasted verbatim into a real config.
Either the real value goes in, or the value is asked for as a plain question first.

**Never paste a real chat id, phone number, token or message into a committed document.** The same
rule as the fixtures — §24. Redact, or use an obviously synthetic value and say that it is one.

**Russian in every document written from now on** — corrected 2026-09-21; this rule used to say
"English in committed documents", which `NEED-108` overturned on 2026-09-20. The documents that
already exist in English stay English and are not translated: `ARCHITECTURE.md`, this file,
`DECISIONS.md`, `REQUIREMENTS.md`, `TESTING.md`, `BACKLOG.md`. A new section added to one of them
follows the language of the file it lands in. Do not mix languages inside one file.

## The changelog

`CHANGELOG.md` is read by someone deciding whether to upgrade, and by the GitHub release built from
it. **A line that only names the change is not an entry.** «`bot messages search --limit` говорил
`hasMore: false`» leaves the reader asking what that broke, whether it touched them, and what to do.

Every entry answers, in plain Russian, in this order:

1. **What changed, as the user sees it** — the bold lead, a whole sentence: the command, what it does
   now, and what it did before.
2. **Why** — one or two sentences, unless it is obvious (a new command needs no reason; a changed
   permission does).
3. **What to watch for** — who is affected, what can break or behave differently, and what to do
   about it. Skip it only when nothing changes for anyone who does not use the new thing.

```md
- **Агент через `max mcp` закрывает опрос, только если профилю разрешено `edit`.** Раньше хватало
  `reaction`.
  Почему: закрытие правит сообщение с опросом, и команда `max polls close` всегда требовала `edit` —
  агент и человек получали на одно действие разные права.
  Что учесть: если в `allow` есть `reaction`, но нет `edit`, агент больше не видит `max_polls_close`;
  добавьте `edit`. Без `allow` ничего не меняется.
```

Headings, only these, each at most once: `Что нового`, `Изменено — может сломать скрипты`,
`Исправлено`, `Безопасность`, `Удалено`. Anything that changes a command's output, an exit code, an
option, a permission or a config key goes under `Изменено — может сломать скрипты`. No backlog,
journal or decision ids, no file paths, no internal names; a link to the doc page that describes it.
`pnpm release:check` checks the shape; the content is the release skill's job and the owner's.
