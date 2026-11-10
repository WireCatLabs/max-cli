### Что нового

- **`muted:` в поиске и статистике, из `@wirecat/cli-core` 0.633.0.** `muted:false` не учитывает чаты, где вы
  выключили уведомления, поэтому `stats messages show -- 'date>=30d muted:false'` считает только то, что синхронизация
  ещё читает. `stats messages responses` и `stats messages waiting` тоже его понимают.
- **`store import`, из `@wirecat/cli-core` 0.633.0.** Загружает выдуманные чаты, людей и сообщения из файла с пометкой synthetic в тестовое хранилище, например в песочницу Desktop; настоящее хранилище владельца не трогает.
