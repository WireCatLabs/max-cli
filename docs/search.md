# Поиск сообщений

`max messages search` ищет только в общем локальном архиве, без сети и отметок о прочтении.

## Быстрый старт

```sh
max messages search 'invoice AND (kind:group OR kind:private)' --json
max messages search 'from:"Alice Synthetic" date:[2026-01-01 TO 2026-02-01}' --timezone Europe/Madrid --json
max messages search 'preset:secret kind:saved' --json
max messages search 'text:/pass(port)?/' --json
max messages search 'chat:"Работа" AND body:/.*invoice.*/' --json
max messages search 'has:file' --json
```

Имена в примерах замените своими. Слова и фразы сопоставляются строго, без автоматических
исправлений и подстрочного поиска. `alpha OR beta gamma` означает `(alpha OR beta) AND gamma`;
`alpha OR beta AND gamma` — `alpha OR (beta AND gamma)`. Для ясности ставьте скобки.

## Поля и операторы

Поддержаны поля `text/body/from/chat/date/kind/has/topic/in/preset/filename/mime/size`, логические
группы и группы значений поля, включающие и исключающие диапазоны, ограниченные wildcard и Lucene regex.
`topic` требует одного обязательного чата. `kind:bot` выбирает собеседника, `in:bots` — аккаунты
Bot API. `tag` пока не поддержан; fuzzy/proximity/boost/intervals также дают ошибку. Неизвестные
поля не становятся текстом.

Файлы ищутся по имени и размеру, текст сообщения не нужен: `filename:*.pdf`, `filename:*договор*`
(имя целиком, без учёта регистра и ё), `size>10MB`, `size:[1KB TO 300KB]` (KB/MB/GB по 1024).
MAX не сообщает тип файла, поэтому `mime:` здесь ничего не находит — ищите по расширению.
Ссылку на сайт находит фраза: `has:link AND "github.com"`.

## Даты и regex

`--timezone` задаёт часовой пояс IANA; дата без времени означает календарный день. Включающая
верхняя граница включает день целиком, исключающая исключает его; из-за перехода на летнее время
день может длиться не 24 часа. Точное время пишите в кавычках, с секундами и смещением от UTC.

Regex поля `text` совпадает с целым нормализованным словом; `body` — с полным исходным текстом,
с учётом регистра. Для подстроки в `body` используйте `.*`. Поддержана часть Lucene regex,
без JS lookaround/backreferences/flags. Превышение пределов строк, байтов, состояний автомата,
работы или времени — явная ошибка; сузьте область поиска.

## Архив и машинный ответ

Пустая выдача не доказывает отсутствие сообщения в мессенджере. JSON сообщает версию запроса,
полноту и охват аккаунтов/чатов и готовность индекса даже без совпадений. `lastSyncedAt` — самый старый момент загрузки чата в охвате,
`null`, если хотя бы один чат ещё не загружался. `inventoryComplete` означает, что каждый аккаунт
в охвате хотя бы раз передал полный список чатов; это не обещает полноту истории. После обновления
старый архив сохраняет `false` и `null` до следующего полного списка и `store fetch`. JSONL содержит только `items`;
для охвата используйте `--json`.
Неготовый word index требует `max store migrate`; историю дочитывают через `max store fetch`.
Готовые предикаты находят кандидатов, а не подтверждают действительность учётных данных.

## Миграция legacy

```sh
max messages search 'from:alice after:7d invoice -draft' --language legacy --json
max messages search --regex 'invoice\s+\d+' --json
```

Legacy сохраняет прежние фильтры и поиск с исправлениями. `--regex` — отдельный режим JS `iu`
по полному тексту с изолированным worker и пределами; сочетание `--regex --language lucene`
отвергается. Программный контракт сохранённого запроса содержит `language/version`;
предпросмотр миграции не обещает сохранить результаты поиска с исправлениями.

## Полная справка

[Основная справка языка](https://github.com/leemour/cli-messaging/blob/main/docs/search/query-language.md)
содержит таблицы полей и операторов, Unicode и экранирование, готовые предикаты, пределы,
ошибки и десять проверяемых рецептов.
[Техническая спецификация](https://github.com/leemour/cli-messaging/blob/main/docs/search/query-language-spec.md)
описывает зафиксированную грамматику, AST/schema, эталонные примеры и компилятор.
[Архив](archive.md) объясняет fetch и полноту; [команды](commands.md) перечисляют текущие параметры.

## Поиск через MCP

`max_messages_search` использует тот же язык и service, что `messages search`. Запрос содержит
`text` или versioned `ast`; `language` выбирает `lucene` или `legacy`, `timezone` задаёт календарный
часовой пояс. `chat` принимает id или имя из локальной копии; `source`, `newest`, `context` и `limit`
выбирают охват и представление результата.

Ответ сохраняет `query`, `coverage`, `completeness`, `wordsReady` и `corrections` рядом с обычной
страницей `items/page/limit/hasMore`, в том числе при нуле совпадений. Metadata описывает локальный
архив, а не полноту удалённого чата. Права инструмента и его имя при этом сохраняются.

`wordsReady` сообщает готовность словесного индекса и для запросов только по фильтрам или regex.
При `false` завершите `max store migrate`; строгий поиск по словам до этого отказывает,
а legacy использует поиск по частям слов.
