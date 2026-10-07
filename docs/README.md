# Documentation

`max` is a command line interface for MAX Messenger bots, through the official Bot API, and for a
personal MAX account, through an unofficial, reverse-engineered protocol. Every command and option
is listed in [commands.md](commands.md).

## Building it

- [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md) — how it is built **now**, and which seams you may not cross
- [dev/architecture/](dev/architecture/) — its detail: session and login sync, reading messages, the store and search
- `docs_ai/REQUIREMENTS.md` — the owner's brief, cited by section number
- `docs_ai/DECISIONS.md` — what was ruled, and why — read before "fixing" something odd
- [dev/CONVENTIONS.md](dev/CONVENTIONS.md) — how code and documents are written here
- [dev/TESTING.md](dev/TESTING.md) — how to check it yourself, and what each check is for
- [dev/BACKLOG.md](dev/BACKLOG.md) — what is left
- `docs_ai/BACKLOG_DONE.md` — what is closed, one line each

## Reference — generated, never hand-written

- [commands.md](commands.md) — every command, option and exit code — **generated**, `pnpm generate`
- [dev/protocol.md](dev/protocol.md) — every opcode and where its shape came from — **generated**

Neither is edited by hand. `pnpm generate` rewrites both and CI asserts the tree did not change,
so a reference that quotes a command the program no longer has cannot reach `main`.

## Using it — in Russian

Каждая страница отвечает на один вопрос и открывается под задачу, а не читается подряд.

- [installation.md](installation.md) — установка, требования, куда ложатся файлы, обновление
- [bot.md](bot.md) — бот через официальный Bot API: токен, несколько ботов, сообщения, чаты, список получателей, `bot api`
- [usage.md](usage.md) — личный аккаунт: вход, профили, чтение, страницы, отправка, машинный режим — по порядку
- [sessions.md](sessions.md) — откуда берётся токен, ключница, профили, `MAX_TOKEN`
- [configuration.md](configuration.md) — настройка по шагам
- [configuration-reference.md](configuration-reference.md) — все ключи, переменные и порядок разрешения
- [cli-contract.md](cli-contract.md) — команды, JSON, ошибки, пределы и запуск агентом
- [search.md](search.md) — поиск сообщений: слова, люди, даты, файлы, ссылки, метки, сохранённые поиски, подсчёт
- [topic-search.md](topic-search.md) — поиск по темам: разговоры, векторы, свежесть, что уходит внешней модели
- [query-language.md](query-language.md) — язык запросов: поля, операторы, preset, пределы, ответ JSON
- [mcp.md](mcp.md) — MCP-сервер для клиентов без терминала: подключение, отправка, соединение с MAX
- [remote.md](remote.md) — ChatGPT или Claude в браузере: вход по паролю и публичный адрес без своего домена
- [groups.md](groups.md) — группы, которые вы ведёте: сценарии с агентом, правила, проверка по ним
- [people.md](people.md) — один человек: профиль, его сообщения по чатам, похож ли на бота
- [recipes.md](recipes.md) — рецепты для агентов: сводка, отчёт, долги, неотвеченное, запуск по расписанию
- [diagnostics.md](diagnostics.md) — `--trace`, `--record`, `max runs` — и чего в записи нет
- [security.md](security.md) — что попадает на диск, а что не попадает никогда
- [troubleshooting.md](troubleshooting.md) — по симптому: что видно на экране и что делать
- [roadmap.md](roadmap.md) — что планируется
- `docs_ai/releasing.md` — как выпускается версия, и кем
- [../CHANGELOG.md](../CHANGELOG.md) — что изменилось между версиями

`ARCHITECTURE.md` describes the code as it behaves today. **When a document disagrees with the
code, the code is right and the document gets corrected in place.**

The working trail — the handoff, plans, the session journal and the cleanup list — lives in
`docs_ai/`, a separate private repository cloned into that folder; this one ignores it.
