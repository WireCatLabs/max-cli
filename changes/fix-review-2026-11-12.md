### Безопасность

- **Ответ Bot API с переадресацией на другой сервер отвергается.** Запросы `max <profile> bot …` идут только на
  адрес Bot API; переадресация на другой сервер — ошибка `configuration_error` с причиной
  `network.host-undeclared`, и запрос туда не уходит.

### Исправлено

- **`config set` принимает общие настройки WireCat.** `picture_search`, `history_dialog_days`,
  `history_group_days`, `history_group_members_max`, `history_muted`, `keep_store_runs_for_days` и
  `record_input "failed"` отвергались как «не настройка max», хотя max их читает, а [поиск](../docs/search.md) и
  [справочник настроек](../docs/configuration-reference.md) советуют их задать. Модель речи по-прежнему задаёт
  `transcribe_model`.
- **`--timeout` и `MAX_TIMEOUT` понимают часы и дни:** `--timeout 6h`, `1d`. Раньше были только `ms`, `s` и `m`, и
  пример `--timeout 6h` из [архива](../docs/archive.md) отвергался.
- **Отказ `confirmation_required` называет ключ разрешения** в `details.permission`, как в других CLI WireCat.
- **В [языке запросов](../docs/query-language.md) описаны `*часть*`, `from:Имя*` и поле `muted:`.**
