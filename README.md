<p align="center">
  <img src="https://raw.githubusercontent.com/WireCatLabs/max-cli/main/docs/images/social-preview.png" alt="MAX CLI для людей, ботов и агентов" width="100%">
</p>

# MAX CLI для людей, ботов и агентов

Ваш аккаунт и ваши боты [MAX](https://max.ru) — в терминале и в ИИ-агентах. Читайте, ищите и
отвечайте сами или поручите это Claude, Codex и Cursor — по вашим правилам.

[Документация](https://wirecat.dev/ru/docs/max) · [Примеры](https://github.com/WireCatLabs/max-cli/blob/main/docs/recipes.md) · [WireCat](https://wirecat.dev/ru)

[![npm](https://img.shields.io/npm/v/@wirecat/max-cli)](https://www.npmjs.com/package/@wirecat/max-cli)
[![CI](https://github.com/WireCatLabs/max-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/WireCatLabs/max-cli/actions/workflows/ci.yml)
[![Node](https://img.shields.io/node/v/@wirecat/max-cli)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/bun-1.3%2B-f9f1e1)](https://bun.sh/)
[![npm downloads](https://img.shields.io/npm/dm/@wirecat/max-cli)](https://www.npmjs.com/package/@wirecat/max-cli)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

<!-- Слот для демо: GIF или видео на 30–45 секунд, файл в docs/images/, ссылка абсолютная
     (https://raw.githubusercontent.com/WireCatLabs/max-cli/main/docs/images/…), чтобы картинка
     открывалась и на npmjs.com. Только вымышленный аккаунт. -->

Пример разговора с агентом (люди и чаты вымышленные):

```text
Вы:     Что я кому обещал за последние три дня?
Агент:  (вызывает max personal review: 12 чатов, 3 голосовых расшифровано)
        Я должен
        · Алисе Пример — прислать счёт до пятницы. Личный чат, 24.09
        Жду от других
        · Борис Образцов — макет к 25.09. В группе «Дизайн» его пока нет
        Нужно уточнить
        · «Проект Альфа»: кто везёт образцы — договорились «потом решим», 25.09
Вы:     Напомни Борису про макет.
Агент:  Черновик: «Борис, привет! Как там макет?» Отправить?
Вы:     Да.
```

## Быстрый старт

```sh
npm install -g @wirecat/max-cli
max personal setup --agent claude   # вход по QR-коду и навык для Claude Code
max personal inbox                  # непрочитанное во всех чатах, ничего не отмечая
```

`max personal setup` за пять минут проводит через вход: вы сканируете QR-код в приложении MAX, и `max`
становится ещё одним вашим устройством. Вместо `claude` можно указать `codex`, `cursor`, `gemini`,
`all` или `none`; войти можно и по SMS через web.max.ru — `max personal setup --help`.

Нужен Node 22.16+ (ветка 22.x) или 24+, либо Bun 1.3+; работает в Windows, macOS и Linux.
Попробовать без установки — `npx @wirecat/max-cli --help`. Если `max` не находится,
`npx @wirecat/max-cli doctor` скажет почему.

Подробнее: [установка](https://github.com/WireCatLabs/max-cli/blob/main/docs/installation.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/installation)), [вход и профили](https://github.com/WireCatLabs/max-cli/blob/main/docs/sessions.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/sessions)).

## Что можно сделать

**Разобрать, что пришло.** «Используй max CLI: кто ждёт моего ответа и что срочно?»

```sh
max personal inbox
```

**Найти что угодно.** «Когда мы договорились о встрече с Алисой?» — ответ с датой и самим
сообщением, по локальной копии и без запросов к MAX.

```sh
max personal search all "встреча Алиса"
```

**Понять, кто кому что должен.** «Что я обещал и чего жду от других?» — вся переписка с прошлого
обзора, ваши сообщения и голосовые текстом.

```sh
max personal review 'date>3d' --transcribe
```

Ещё: сводки утром и вечером, итог недели по рабочему чату, кому вы обещали ответить, черновики
ответов, которые отправляете вы или агент с вашего разрешения.

Подробнее: [рецепты для агентов](https://github.com/WireCatLabs/max-cli/blob/main/docs/recipes.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/recipes)).

## Для ИИ-агентов

Ваш агент. Ваш MAX. Ваши правила.

- **Агент с терминалом** — Claude Code, Codex, Cursor, Gemini CLI. Он сам вызывает `max`, а навык
  (skill) — инструкция для агента — объясняет ему команды и ограничения. `max personal setup` ставит навык
  сам; отдельно — `max skill install`.
- **Приложение без терминала** — Claude Desktop, Cursor и другие клиенты MCP. Подключите
  MCP-сервер `max personal mcp`; готовые просьбы `/catch-up`, `/review`, `/reply` и `/find` уже внутри.
- **ChatGPT или Claude в браузере** — через HTTPS-туннель и вход по коду.

```sh
max personal mcp setup claude-code  # или codex
max personal mcp config             # запись для Claude Desktop, Cursor и других
```

С `--json` каждая команда отдаёт только данные, а ошибка приходит отдельно, с постоянным кодом
завершения.

Подробнее: [MCP-сервер](https://github.com/WireCatLabs/max-cli/blob/main/docs/mcp.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/mcp)), [браузер](https://github.com/WireCatLabs/max-cli/blob/main/docs/remote.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/remote)), [контракт для скриптов](https://github.com/WireCatLabs/max-cli/blob/main/docs/cli-contract.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/cli-contract)).

## Почему max

- **Весь аккаунт, а не только бот.** Чаты, история, группы, контакты, файлы и голосовые — как в
  приложении. И отдельно бот через официальный Bot API.
- **Своя копия переписки.** Всё прочитанное хранится на вашем компьютере: быстрый поиск и чтение
  без интернета (`--offline`), выгрузка в JSONL или Markdown.
- **Сделан для агентов.** Навык, MCP-сервер, одна форма JSON и коды ошибок, по которым скрипт
  решает, что делать дальше.
- **Безопасен по умолчанию.** Чтение не ставит отметку «прочитано». Есть профиль только для чтения,
  список чатов для записи и лимит сообщений в час. Если имя подходит к двум чатам, `max` не выбирает
  сам. Если связь оборвалась при отправке, `max` так и скажет, а повтор не создаст второе сообщение.
- **Порядок в группах, которые вы ведёте.** Вопросы без ответа, кто вступил, проверка по вашим
  правилам: спам, чужие ссылки, флуд. По умолчанию проверка только отмечает.

### Чем отличается от других

Для MAX есть и другие хорошие проекты; [PyMax](https://github.com/MaxApiTeam/PyMax) — самая полная
библиотека для личного аккаунта, и её код помог разобрать протокол. Коротко, для личного аккаунта:

| | max-cli | [PyMax](https://github.com/MaxApiTeam/PyMax) | [max-mcp](https://github.com/renosaza/max-mcp) |
|---|:-:|:-:|:-:|
| что это | программа и MCP-сервер | библиотека на Python | MCP-сервер на PyMax |
| готовые команды, навык и MCP для агентов | ✅ | — | MCP |
| ограничения для агента: только чтение, список чатов, лимит в час | ✅ | — | — |
| локальная копия с поиском без интернета | ✅ | — | — |
| расшифровка голосовых на вашем компьютере | ✅ | — | — |
| реакции, правка, пересылка, опросы, отложенная отправка | ✅ | ✅ | — |
| для админа группы: вопросы без ответа, проверка по правилам | ✅ | — | — |

Подробнее: [полная таблица](https://github.com/WireCatLabs/max-cli/blob/main/docs/index.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max)).

## Личный аккаунт

`max` без слова `bot` работает с вашим аккаунтом как ещё одно ваше устройство.

> ⚠️ **Для личного аккаунта max-cli использует неофициальный внутренний API MAX.** API может
> измениться без предупреждения, а использование инструмента может нарушать условия сервиса. Вы
> используете max-cli на свой риск; авторы и контрибьюторы не несут ответственности за блокировки
> аккаунтов, потерю данных или другие последствия. Бот работает через официальный API, и к нему
> это не относится.

- **Читать.** Чаты, история, сообщение вместе с соседними, непрочитанное во всех чатах (`max personal inbox`),
  разбор «кто кому должен» (`max personal review`), новые сообщения по мере прихода (`max personal watch`), вложения,
  голосовые — текстом на вашем компьютере.
- **Писать.** Текст и разметка, ответы, фото, видео, файлы и голосовые, правка, пересылка,
  закрепление, реакции, опросы, отложенная отправка, удаление — у себя или у всех.
- **Группы и каналы.** Создать, вступить по ссылке, выйти, участники и админы, настройки, ссылка-приглашение, папки.
- **Контакты и аккаунт.** Найти по номеру, добавить, переименовать, заблокировать, свои заметки о
  людях; профиль и фото; другие сеансы.

```sh
max personal inbox                                              # непрочитанное, ничего не отмечая
max personal messages list "Алиса Пример" --limit 20
max personal messages send "Алиса Пример" "Созвонимся в 15:00?" --reply-to <id>
max personal reactions add "Алиса Пример" <id> 👍
max personal messages send 0 "Позвонить Борису" --at-time 2h    # напоминание себе в «Избранное»
max personal chats mark-read "Алиса Пример"                     # отметить прочитанным, когда нужно
```

Подробнее: [личный аккаунт](https://github.com/WireCatLabs/max-cli/blob/main/docs/usage.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/usage)), [один человек](https://github.com/WireCatLabs/max-cli/blob/main/docs/people.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/people)), [ответы](https://github.com/WireCatLabs/max-cli/blob/main/docs/replies.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/replies)).

## Бот

`max sales bot` работает через **официальный** [Bot API MAX](https://dev.max.ru/docs-api) по токену бота.
Ботов может быть несколько: каждый хранится под именем, которое вы выбираете, и это имя — первое
слово команды. Бота создают на [business.max.ru](https://business.max.ru/self); MAX выдаёт их
подтверждённым организациям, ИП и самозанятым.

```sh
max sales bot auth set                                   # токен — в скрытом вводе, MAX его проверит
max sales bot recipients add "Команда продаж"            # писать только сюда
max sales bot messages send "Команда продаж" "**Сборка готова**" --md --file report.pdf
max sales bot messages pin "Команда продаж" <mid>        # id сообщения — из ответа на send
max sales bot watch --events                             # всё, что происходит в чатах бота
max sales bot chats moderate "Команда продаж" --dry-run  # что нарушает правила — без действий
max sales bot api get-updates --limit 10                 # любой метод Bot API
max sales bot list --check                                     # все боты на этом компьютере
```

- **Полный Bot API.** Каждый метод официальной схемы — `max <бот> bot api <операция>`: параметры —
  флаги, тело — JSON, который сверяется со схемой до отправки.
- **Сообщения и чаты.** Чат называют по номеру, по названию, если бот его видел, или человека как
  `user:<номер>`. Файлы, участники, комментарии, кнопки, меню команд, вебхуки.
- **Модерация.** `bot chats rules` и `bot chats moderate` удаляют спам и людей по вашим правилам.
- **Копия переписки бота.** `bot contacts show`, `bot search messages --from`,
  `bot messages between` — без запросов к MAX.
- **Бот не напишет лишнего.** Свой список чатов для записи, журнал отправленного без текста,
  `permissions` и MCP-сервер `max <бот> bot mcp`. Токен — в системном хранилище паролей, отдельно от вашего.

Подробнее: [бот MAX](https://github.com/WireCatLabs/max-cli/blob/main/docs/bot.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/bot)).

## Группы, которые вы ведёте

```sh
max personal review chat:"Поход" --unanswered              # вопросы, на которые сутки никто не ответил
max personal chats events "Поход"                          # кто вступил и вышел
max personal chats members list "Поход" --all              # все участники: когда заведён аккаунт
max personal chats rules set "Поход" invites delete        # приглашения в чужие чаты — удалять
max personal chats moderate "Поход" --dry-run              # что нарушает правила — без действий
```

Проверка сверяет новое в группе с вашими правилами: заблокированные люди, приглашения, ссылки,
пересланное, флуд, совсем новые аккаунты. По умолчанию она только отмечает. Для каждого действия вы
решаете сами: никогда, только с флагом, с вашим подтверждением или сразу. Не больше 10 действий за
раз, и ничего не следит за группой в фоне.

Подробнее: [группы](https://github.com/WireCatLabs/max-cli/blob/main/docs/groups.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/groups)), [рейтинги](https://github.com/WireCatLabs/max-cli/blob/main/docs/rankings.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/rankings)).

## Локальная копия и поиск

Всё прочитанное сохраняется на вашем компьютере. По копии работают поиск и чтение без интернета;
историю чата можно скачать глубже и выгрузить.

```sh
max personal search all "договор"                             # сообщения, почта и заметки сразу
max personal search messages 'договор chat:"Проект Альфа"'  # только один чат
max personal messages sync "Проект Альфа" --last 500            # последние 500 сообщений — в копию
max personal store export "Проект Альфа" --format markdown --output alfa.md
max personal chats list --offline                             # без подключения к MAX
```

Поиск понимает слова, людей, даты, файлы, ссылки и ваши метки; есть поиск по темам и сохранённые
запросы. Текст из сохранённых вложений ищется через `content:`.

Подробнее: [локальная копия](https://github.com/WireCatLabs/max-cli/blob/main/docs/archive.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/archive)), [поиск](https://github.com/WireCatLabs/max-cli/blob/main/docs/search.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/search)), [язык запросов](https://github.com/WireCatLabs/max-cli/blob/main/docs/query-language.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/query-language)), [поиск по темам](https://github.com/WireCatLabs/max-cli/blob/main/docs/topic-search.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/topic-search)), [вложения](https://github.com/WireCatLabs/max-cli/blob/main/docs/attachments.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/attachments)), [голосовые](https://github.com/WireCatLabs/max-cli/blob/main/docs/audio-recognition.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/audio-recognition)).

## Агенты: навык и MCP

**Навык** ставится одной командой и всегда той же версии, что и `max`: в `~/.claude/skills/max-cli/`
для Claude Code и в `~/.agents/skills/max-cli/` для Codex, Gemini CLI и Cursor. После обновления
`max` запустите установку ещё раз.

```sh
max skill show                  # прочитать до входа
max skill install --for all     # или --for claude, --for agents
```

**MCP-сервер** работает с тем же аккаунтом. Права профиля проверяются при каждом вызове; формы
подтверждения на сервере нет — подтверждение вызовов настраивается в приложении агента. Навык
доступен ресурсом `max://skill`.

```sh
max personal mcp doctor                                       # проверить локальный MCP
max personal mcp --http --public-url https://<имя>.ts.net     # для ChatGPT и Claude в браузере
max personal mcp --permission messages.send=ask               # временно изменить право
```

Подробнее: [MCP-сервер](https://github.com/WireCatLabs/max-cli/blob/main/docs/mcp.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/mcp)), [браузер](https://github.com/WireCatLabs/max-cli/blob/main/docs/remote.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/remote)), [внешние модели](https://github.com/WireCatLabs/max-cli/blob/main/docs/external-models.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/external-models)).

## Для скриптов

С `--json` команда печатает только данные; так же она работает, когда её вывод читает другая
программа (`max … | jq`). Любой список приходит в одной форме:

```json
{ "items": [ … ], "page": { "limit": 20, "has_more": true }, "meta": { … } }
```

Ошибка приходит одной строкой JSON в stderr, stdout остаётся пустым. Код завершения говорит, что
случилось: `4` — нужно войти, `5` — права не разрешают, `6` — чат или сообщение не найдены, `8` —
лимит, `9` — MAX не ответил вовремя, `14` — неизвестно, ушло ли сообщение (повторять только с тем же
`--operation-id`). Частичный результат может прийти с кодом `0`: проверьте поля `missing` и `next`.

Подробнее: [контракт](https://github.com/WireCatLabs/max-cli/blob/main/docs/cli-contract.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/cli-contract)), [все команды и коды](https://github.com/WireCatLabs/max-cli/blob/main/docs/commands.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/commands)).

## Вход и профили

```sh
max personal setup --agent codex       # QR-код в терминале и навык Codex
max personal setup --method qr-chrome  # QR через web.max.ru в браузере
max personal setup --method sms        # номер телефона — в браузере
max personal setup --method token      # готовый токен, скрытым вводом или через stdin
max personal session start qr          # повторный вход, когда сессия истекла
```

Профиль называется **первым словом** в каждой команде — `max personal chats list`, — или
`export MAX_PROFILE=personal` на всю сессию оболочки, или `max config set default_profile personal`
насовсем. `max` никогда не выбирает профиль сам, даже единственный: без имени команда останавливается
и перечисляет профили этого компьютера. Имя `personal` — пример: любое подойдёт.

Подробнее: [вход и сессии](https://github.com/WireCatLabs/max-cli/blob/main/docs/sessions.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/sessions)), [профили](https://github.com/WireCatLabs/max-cli/blob/main/docs/profiles.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/profiles)).

## Настройки и права

У каждого профиля свои настройки и права; без файла настроек действуют встроенные значения.

| Настройка | Что делает | По умолчанию |
|---|---|---|
| `permissions` | что можно: `deny`, `readonly`, `ask`, `allow` — для команды или группы команд | всё, кроме удаления и других необратимых действий: они спрашивают |
| `sends_per_hour` | сколько сообщений профиль отправит за час | `30` |
| `requests_per_minute` | темп обращений к MAX | `20` |
| `catch_up_marks_read` | `inbox` и `review` отмечают показанное прочитанным | `false` |
| `limit` | сколько строк в списке | `20` |

```sh
max personal config set permissions.messages readonly  # профиль только для чтения
max personal config set permissions.messages.send ask  # спрашивать перед отправкой
```

Подробнее: [настройки](https://github.com/WireCatLabs/max-cli/blob/main/docs/configuration.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/configuration)), [права](https://github.com/WireCatLabs/max-cli/blob/main/docs/permissions.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/permissions)), [все ключи](https://github.com/WireCatLabs/max-cli/blob/main/docs/configuration-reference.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/configuration-reference)).

## Ограничения

`max` держит каждый профиль в одном темпе: первые 10 запросов идут сразу, дальше — 20 в минуту, и
две команды одновременно делят этот темп. Если MAX отвечает «слишком много запросов», `max`
останавливается и не повторяет запрос сам. Фоновый `max personal serve` держит одно подключение для всех
команд и сам останавливается, когда им 15 минут никто не пользуется.

Подробнее: [ограничения и ожидания](https://github.com/WireCatLabs/max-cli/blob/main/docs/limits.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/limits)).

## Безопасность

- Токен входа — в системном хранилище паролей, не в файле и не в истории команд.
- Локальная копия и служебные файлы доступны только вашему пользователю; от кражи диска защищает
  шифрование диска целиком.
- Перед каждой отправкой, в том числе через фоновый сервер и MCP, `max` проверяет ограничения
  профиля и пишет строку в журнал — без текста сообщения.
- `--file` не отправит известные файлы с учётными данными, папки `max` и хранилище.
- Чужой текст не управляет вашим терминалом: управляющие символы из имён и сообщений показываются
  как текст.
- Ограничения защищают от агента, которого уговорило прочитанное сообщение, но не от агента,
  который хочет их обойти: для этого нужна песочница или отдельный пользователь.

Подробнее: [безопасность](https://github.com/WireCatLabs/max-cli/blob/main/docs/security.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/security)).

## Когда не работает

```sh
max personal doctor               # где лежат файлы и есть ли вход; к MAX не подключается
max personal chats list --trace   # каждый запрос к MAX — без текстов, имён и токена
max personal runs list            # неудачные и частичные запуски сохраняются сами
```

Запись `--trace` можно приложить к сообщению об ошибке.

Подробнее: [по симптому](https://github.com/WireCatLabs/max-cli/blob/main/docs/troubleshooting.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/troubleshooting)), [диагностика](https://github.com/WireCatLabs/max-cli/blob/main/docs/diagnostics.md) ([wirecat.dev](https://wirecat.dev/ru/docs/max/diagnostics)).

## Документация

Каждая страница есть и на сайте — [wirecat.dev/ru/docs/max](https://wirecat.dev/ru/docs/max); ниже —
исходники в этом репозитории.

| Раздел | Страницы |
|---|---|
| Начало | [обзор и сравнение](https://github.com/WireCatLabs/max-cli/blob/main/docs/index.md) · [установка](https://github.com/WireCatLabs/max-cli/blob/main/docs/installation.md) |
| Как пользоваться | [личный аккаунт](https://github.com/WireCatLabs/max-cli/blob/main/docs/usage.md) · [вход и сессии](https://github.com/WireCatLabs/max-cli/blob/main/docs/sessions.md) · [локальная копия](https://github.com/WireCatLabs/max-cli/blob/main/docs/archive.md) · [поиск](https://github.com/WireCatLabs/max-cli/blob/main/docs/search.md) · [вложения](https://github.com/WireCatLabs/max-cli/blob/main/docs/attachments.md) · [голосовые](https://github.com/WireCatLabs/max-cli/blob/main/docs/audio-recognition.md) · [внешние модели](https://github.com/WireCatLabs/max-cli/blob/main/docs/external-models.md) · [рейтинги](https://github.com/WireCatLabs/max-cli/blob/main/docs/rankings.md) · [поиск по темам](https://github.com/WireCatLabs/max-cli/blob/main/docs/topic-search.md) · [язык запросов](https://github.com/WireCatLabs/max-cli/blob/main/docs/query-language.md) · [бот MAX](https://github.com/WireCatLabs/max-cli/blob/main/docs/bot.md) · [группы](https://github.com/WireCatLabs/max-cli/blob/main/docs/groups.md) · [один человек](https://github.com/WireCatLabs/max-cli/blob/main/docs/people.md) · [ответы](https://github.com/WireCatLabs/max-cli/blob/main/docs/replies.md) · [MCP-сервер](https://github.com/WireCatLabs/max-cli/blob/main/docs/mcp.md) · [браузер](https://github.com/WireCatLabs/max-cli/blob/main/docs/remote.md) · [рецепты](https://github.com/WireCatLabs/max-cli/blob/main/docs/recipes.md) |
| Справочник | [все команды](https://github.com/WireCatLabs/max-cli/blob/main/docs/commands.md) · [настройки](https://github.com/WireCatLabs/max-cli/blob/main/docs/configuration.md) · [права](https://github.com/WireCatLabs/max-cli/blob/main/docs/permissions.md) · [профили](https://github.com/WireCatLabs/max-cli/blob/main/docs/profiles.md) · [все ключи настроек](https://github.com/WireCatLabs/max-cli/blob/main/docs/configuration-reference.md) · [контракт для скриптов](https://github.com/WireCatLabs/max-cli/blob/main/docs/cli-contract.md) · [ограничения](https://github.com/WireCatLabs/max-cli/blob/main/docs/limits.md) |
| Если что-то не так | [диагностика](https://github.com/WireCatLabs/max-cli/blob/main/docs/diagnostics.md) · [когда не работает](https://github.com/WireCatLabs/max-cli/blob/main/docs/troubleshooting.md) · [безопасность](https://github.com/WireCatLabs/max-cli/blob/main/docs/security.md) |
| Проект | [дорожная карта](https://github.com/WireCatLabs/max-cli/blob/main/docs/roadmap.md) |
| Изменения | [CHANGELOG.md](https://github.com/WireCatLabs/max-cli/blob/main/CHANGELOG.md) |

Для разработчиков: [архитектура](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/ARCHITECTURE.md), [проверки](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/TESTING.md),
[протокол](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/protocol.md) (генерируется), [что осталось](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/BACKLOG.md).

## Разработка

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm smoke:bun          # собранная команда под Bun
pnpm generate                         # переписать сгенерированные файлы
```

Протокол MAX неофициальный и разобран обратной инженерией. Каждый опкод объявлен один раз в
`src/spec/`, а реестр, типизированный клиент и `docs/dev/protocol.md` из него генерируются; CI
падает, если дерево устарело. Общая часть — потоки вывода, коды ошибок, хранилище паролей — в
[`@wirecat/cli-base`](https://github.com/WireCatLabs/cli-base).

## Часть WireCat

max-cli — часть [WireCat](https://wirecat.dev/ru): открытого слоя контекста для ИИ-агентов, который
хранит данные на вашем компьютере. Начните с MAX. Добавьте Telegram, почту и заметки, когда
понадобится. Ваш контекст. Любой агент.

## Участие и лицензия

Пулл-реквесты, сообщения об ошибках и предложения —
[issues](https://github.com/WireCatLabs/max-cli/issues).

Делаем автоматизацию и инструменты под задачу: интеграции с MAX и другими мессенджерами,
ИИ-агентов, внутренние сервисы — [info@neirox.ai](mailto:info@neirox.ai).

Apache License 2.0 — [LICENSE](LICENSE).
