<p align="center">
  <img src="https://raw.githubusercontent.com/WireCatLabs/max-cli/main/docs/images/social-preview.png" alt="MAX CLI для ИИ-агентов" width="100%">
</p>

# max: CLI для MAX и ИИ-агентов

<p align="center">
  Узнайте, кто ждет вашего ответа в MAX, и найдите любое сообщение за секунды, не открывая приложение. Спросите
  агента в Claude Code, Codex или любом приложении с MCP. Копия переписки хранится на вашем компьютере, поэтому
  поиск работает и без сети.
</p>

<p align="center">
  <a href="https://wirecat.dev/ru/docs/max">Документация</a> ·
  <a href="https://github.com/WireCatLabs/max-cli/blob/main/docs/installation.md">Установка</a> ·
  <a href="https://github.com/WireCatLabs/max-cli/blob/main/docs/usage.md">Использование</a> ·
  <a href="https://t.me/wirecatdev">Чат в Telegram</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wirecat/max-cli"><img src="https://img.shields.io/npm/v/@wirecat/max-cli" alt="npm"></a>
  <a href="https://github.com/WireCatLabs/max-cli/actions/workflows/ci.yml"><img src="https://github.com/WireCatLabs/max-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@wirecat/max-cli"><img src="https://img.shields.io/npm/dm/@wirecat/max-cli" alt="npm downloads"></a>
  <a href="https://github.com/WireCatLabs/max-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache 2.0"></a>
</p>

- **Пишите от своего имени или от имени бота.** Личный аккаунт входит по QR-коду, бот работает через официальный
  Bot API MAX.
- **Поиск, который находит.** Вся переписка ищется на вашем компьютере, даже с опечаткой или по смыслу. Голосовые
  ищутся тоже.
- **Порядок в группах без ручной работы.** Спам убирается по вашим правилам, а вопросы без ответа видны сразу.

## Что вы получаете

- **Ничего важного не пропустите.** Одна команда показывает, кто ждет вашего ответа, во всех чатах. Ничего не
  отмечается прочитанным.
- **Найдете любое сообщение за секунды.** "Когда мы договорились о встрече с Алисой?" Ответ с датой и самим
  сообщением, даже без интернета.
- **Ответите, даже когда не можете.** Автоответы по вашим правилам и только тем людям, которых вы выбрали.
- **Прочитаете голосовое, не слушая его.** Голосовые становятся текстом прямо на вашем компьютере.
- **Будете знать, кто кому должен.** "Что я обещал на этой неделе и чего жду от других?" Один ответ по всем чатам.
- **Увидите всю картину.** Свяжите аккаунты человека в MAX и Telegram и спрашивайте о нем сразу везде.

```text
Вы:     Что я кому обещал за последние три дня?
Агент:  (вызывает max personal review 'date>3d': 12 чатов)
        Я должен
        · Алисе Пример: прислать счет до пятницы. Личный чат, 24.09
        Жду от других
        · Борис Образцов: макет к 25.09. В группе "Дизайн" его пока нет
Вы:     Напомни Борису про макет.
Агент:  Черновик: "Борис, привет! Как там макет?" Отправить?
Вы:     Да.
```

## Почему max

- **Ваши данные не покидают компьютер.** `max` общается только с MAX. Сервера WireCat нет, аккаунт у нас не нужен.
  Переписка хранится в локальной базе, которую может читать только ваш пользователь.
- **Ваш аккаунт как еще одно устройство.** `max` входит по QR-коду, как веб-версия MAX. Для личного аккаунта он
  использует неофициальный API MAX, риск описан [ниже](#личный-аккаунт).
- **Поиск на всю глубину.** Скачайте историю чата один раз и ищите в ней без сети. Поиск находит слово с опечаткой и
  вопрос, который вы помните наполовину.
- **Можно доверить агенту.** Вы решаете, что агенту можно. Например, писать только в чаты из списка и не больше 30
  сообщений в час. Чужой текст приходит агенту как данные, и агент не примет прочитанное сообщение за команду.
- **Готов для любого агента.** Навык для Claude Code и Codex, MCP-сервер для Claude Desktop и Cursor.
- **Бесплатно и с открытым кодом.** Apache 2.0, на macOS, Linux и Windows.

Чем отличается от других инструментов для MAX: [сравнение](https://wirecat.dev/ru/docs/max/compare).

## Быстрый старт

```sh
npm install -g @wirecat/max-cli    # или: bun add -g @wirecat/max-cli
max personal setup                 # вход по QR-коду и навык для агента
max personal inbox                 # непрочитанное во всех чатах, ничего не отмечая
```

Это около пяти минут. Вы сканируете QR-код в приложении MAX, и `max` становится еще одним вашим устройством.
`personal` это имя, которое вы выбираете для аккаунта, потом можно добавить `work` или любое другое. `setup` ставит и
навык для агента. Войти можно и по SMS через web.max.ru, подробности в `max personal setup --help`.

Нужен Node.js 22.16+ или 24+, либо Bun 1.3+. Попробовать без установки: `npx @wirecat/max-cli --help`.

Подробнее: [установка](https://wirecat.dev/ru/docs/max/installation), с Windows и pnpm.

## С вашим агентом

Просите обычными словами. Агент сам выберет команды.

> *"Используй max. Что пришло с утра и кто ждет моего ответа?"*
> *"Используй max. На какие вопросы в группе Поход никто не ответил?"*
> *"Используй max. Найди PDF, который Алиса прислала про аренду."*

- **Claude Code, Codex** и другие агенты с терминалом вызывают `max` сами. `max skill install --for all` учит их, как.
- **Claude Desktop, Cursor** и другие MCP-приложения подключаются к `max personal mcp serve`. Готовые просьбы уже
  внутри, например `/catch-up` и `/review`.
- **ChatGPT или Claude в браузере** подключаются через ваш собственный туннель, после входа по одноразовому коду.

```sh
max personal mcp add claude-code --allow-writes   # или: codex
max personal mcp config                           # запись для Claude Desktop, Cursor и других
```

Подробнее: [агенты и MCP](https://wirecat.dev/ru/docs/max/mcp) · [из браузера](https://wirecat.dev/ru/docs/max/remote) ·
[рецепты](https://wirecat.dev/ru/docs/max/recipes)

## Что он умеет

### Личный аккаунт

Почти все, что умеет приложение MAX, от ответа на сообщение до отложенной отправки.

```sh
max personal messages list "Алиса Пример" --limit 20
max personal messages send "Алиса Пример" "Созвонимся в 15:00?" --reply-to <id>
max personal review --new   # все новое с прошлого обзора
```

> ⚠️ **Для личного аккаунта max-cli использует неофициальный внутренний API MAX.** API может измениться без
> предупреждения, а использование инструмента может нарушать условия сервиса. Вы используете max-cli на свой риск.
> Авторы и контрибьюторы не несут ответственности за блокировки аккаунтов, потерю данных или другие последствия. Бот
> работает через официальный API, и к нему это не относится. Подробнее:
> [протокол неофициальный](https://wirecat.dev/ru/docs/max/security).

Подробнее: [личный аккаунт](https://wirecat.dev/ru/docs/max/usage) · [один человек](https://wirecat.dev/ru/docs/max/people)

### Поиск

```sh
max personal search all "договор аренды"                        # сообщения и заметки, лучшие сверху
max personal search messages 'from:"Алиса Пример" счет date>30d'
max personal search messages 'Во сколько выгрузка проекта Маяк?' --discover   # вопрос, который помните наполовину
max personal search conversations 'переезд за город'            # обсуждения, близкие по смыслу
```

Запрос можно сохранить и запускать снова. С `--offline` поиск не уходит с компьютера.

Подробнее: [поиск](https://wirecat.dev/ru/docs/max/search) · [язык запросов](https://wirecat.dev/ru/docs/max/query-language) ·
[поиск по темам](https://wirecat.dev/ru/docs/max/topic-search) · [локальная копия](https://wirecat.dev/ru/docs/max/archive)

### Группы, которые вы ведете

```sh
max personal review chat:"Поход" --unanswered          # вопросы, на которые сутки никто не ответил
max personal chats rules set "Поход" invites delete    # удалять приглашения в чужие чаты
max personal chats moderate "Поход" --dry-run          # что нарушает правила, без действий
max personal stats chats show "Поход"                  # активность
```

По умолчанию проверка только отмечает нарушение. Удалять или нет, вы решаете сами для каждого правила.

Подробнее: [группы](https://wirecat.dev/ru/docs/max/groups) · [автоответы](https://wirecat.dev/ru/docs/max/replies) ·
[рейтинги](https://wirecat.dev/ru/docs/max/rankings)

### Голосовые и файлы

```sh
max personal messages transcribe "Алиса Пример" <id>   # голосовое текстом, на вашем компьютере
max personal attachments extract                       # текст из сохраненных файлов
```

Подробнее: [голосовые](https://wirecat.dev/ru/docs/max/audio-recognition) · [вложения](https://wirecat.dev/ru/docs/max/attachments)

### Бот

`max <бот> bot` работает с ботом через официальный [Bot API MAX](https://dev.max.ru/docs-api) по токену. Каждый метод
официальной схемы доступен как `max <бот> bot api <операция>`. Бота создают на
[business.max.ru](https://business.max.ru/self).

```sh
max sales bot auth set                                  # токен скрытым вводом, MAX его проверит
max sales bot recipients add "Команда продаж"           # писать только сюда
max sales bot api get-updates --limit 10                # любой метод Bot API
```

Подробнее: [бот MAX](https://wirecat.dev/ru/docs/max/bot)

### Вместе с другими источниками

`max` хранит прочитанное в той же локальной базе, что и другие инструменты WireCat, например Telegram и Google
Календарь. `max personal search all` ищет сразу в сообщениях, заметках и расшифровках встреч. У почты свой поиск в
memo. `max personal contacts link` записывает, что два аккаунта это один человек.

Подробнее: [WireCat](https://wirecat.dev/ru)

## Как это устроено

- **Еще одно устройство.** `max` подключается к MAX так же, как веб-версия. Токен входа хранится в системном
  хранилище паролей, а не в файле и не в командной строке.
- **Локальная копия.** Каждое сообщение, которое прочитал `max`, сохраняется на вашем компьютере. Историю чата можно
  скачать глубже и выгрузить в Markdown.
- **Всегда на связи.** Фоновый `max personal serve` держит одно подключение для всех команд, а
  `max personal server install` запускает его как системную службу.
- **Вежливо с MAX.** Один темп запросов на профиль, общий для всех команд и агентов: первые 10 сразу, дальше 20 в
  минуту. Если MAX отвечает "слишком много запросов", `max` останавливается и не повторяет запрос сам.
- **Без двойной отправки.** Если связь оборвалась при отправке, `max` скажет, что исход неизвестен, и даст повтор с
  тем же `--operation-id`, который не создаст второе сообщение.
- **Для скриптов.** `--json` дает одну форму у всех команд, а у каждого вида ошибки свой код завершения.

Подробнее: [ограничения и ожидания](https://wirecat.dev/ru/docs/max/limits) · [вывод для скриптов](https://wirecat.dev/ru/docs/max/cli-contract)

## Настройки и права

У каждого аккаунта (профиля) свои настройки, например в какие чаты можно писать агенту и сколько сообщений в час.

```sh
max personal config set permissions.messages readonly   # этот профиль не меняет сообщения
max personal config set permissions.messages.send ask   # спрашивать перед отправкой
```

Подробнее: [права](https://wirecat.dev/ru/docs/max/permissions) · [профили](https://wirecat.dev/ru/docs/max/profiles) ·
[настройки](https://wirecat.dev/ru/docs/max/configuration)

## Безопасность

Токен входа хранится в системном хранилище паролей. Локальная копия доступна только вашему пользователю. Перед каждой
отправкой, в том числе через MCP, `max` проверяет права профиля и пишет строку в журнал, без текста сообщения. Чужой
текст не управляет вашим терминалом или агентом.

Подробнее: [безопасность](https://wirecat.dev/ru/docs/max/security) · Сообщить об уязвимости:
[SECURITY.md](https://github.com/WireCatLabs/max-cli/blob/main/SECURITY.md)

## Когда что-то не так

```sh
max personal doctor            # что настроено, без подключения
max personal doctor --online   # проверить, что вход работает
```

Подробнее: [по симптому](https://wirecat.dev/ru/docs/max/troubleshooting) · [диагностика](https://wirecat.dev/ru/docs/max/diagnostics) ·
Вопросы в [чате WireCat в Telegram](https://t.me/wirecatdev). Об ошибках пишите в issues этого репозитория.

## Документация

Все на [wirecat.dev/ru/docs/max](https://wirecat.dev/ru/docs/max). Те же страницы лежат в
[docs/](https://github.com/WireCatLabs/max-cli/blob/main/docs/index.md).

## Разработка

```sh
pnpm install && pnpm test
```

Протокол MAX неофициальный и разобран обратной инженерией. Каждая операция объявлена один раз в `src/spec/`, из нее
генерируется [описание протокола](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/protocol.md).

Подробнее: [архитектура](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/ARCHITECTURE.md) ·
[проверки](https://github.com/WireCatLabs/max-cli/blob/main/docs/dev/TESTING.md)

Пулл-реквесты, сообщения об ошибках и предложения пишите в [issues](https://github.com/WireCatLabs/max-cli/issues).

## Часть WireCat

`max` один из инструментов [WireCat](https://wirecat.dev/ru): открытых локальных инструментов командной строки,
которые дают ИИ-агентам ваш контекст из мессенджеров, почты, календарей и документов. Каждый работает и сам по себе.

## Лицензия

[Apache 2.0](https://github.com/WireCatLabs/max-cli/blob/main/LICENSE)
