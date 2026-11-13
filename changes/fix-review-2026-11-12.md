### Изменено — может сломать скрипты

- **Собран на cli-core 0.651.0** (был 0.647.0). Подробности в
  [журнале изменений cli-core](https://github.com/WireCatLabs/cli-core/blob/main/CHANGELOG.md).
- **У `stats tasks show` больше нет `--chat`:** чат называется в запросе, `-- chat:"Работа"`.
- **`store reset` больше не предлагается через MCP:** ему нужен общий `--yes`, который вызов агента не передаёт.
- **`doctor reports` теперь общий для всех CLI WireCat.** Текст на английском, как в других CLI. `create` больше
  не печатает готовую ссылку на новую задачу и шаги по-русски: он называет файл и адрес, куда его приложить
  (`send_to`). Существующий файл `create` не перезаписывает, а отказывает с причиной `doctor.report-exists`.
- **В `--help` и [списке команд](../docs/commands.md) строка Returns есть только у команд с описанным ответом.**

### Безопасность

- **Ответ Bot API с переадресацией на другой сервер отвергается.** Запросы `max <profile> bot …` идут только на
  адрес Bot API; переадресация на другой сервер — ошибка `configuration_error` с причиной
  `network.host-undeclared`, и запрос туда не уходит.

### Исправлено

- **max знает, какие чаты вы заглушили.** MAX сообщает это при входе, и `chats list` сохраняет `muted` и
  `muted_until` в хранилище. Теперь `muted:true` в запросе находит заглушённые чаты, а `messages sync --all`
  пропускает их без `--with-muted`, как в других мессенджерах WireCat.
- **`config set` принимает общие настройки WireCat.** `picture_search`, `history_dialog_days`,
  `history_group_days`, `history_group_members_max`, `history_muted`, `keep_store_runs_for_days` и
  `record_input "failed"` отвергались как «не настройка max», хотя max их читает, а [поиск](../docs/search.md) и
  [справочник настроек](../docs/configuration-reference.md) советуют их задать. Модель речи по-прежнему задаёт
  `transcribe_model`.
- **`--timeout` и `MAX_TIMEOUT` понимают часы и дни:** `--timeout 6h`, `1d`. Раньше были только `ms`, `s` и `m`, и
  пример `--timeout 6h` из [архива](../docs/archive.md) отвергался.
- **Отказ `confirmation_required` называет ключ разрешения** в `details.permission`, как в других CLI WireCat.
- **В [языке запросов](../docs/query-language.md) описаны `*часть*`, `from:Имя*` и поле `muted:`.**
