### Изменено — может сломать скрипты

- **`max doctor` теперь общая проверка cli-core**, как у tg и wa, а своя копия max на 400 строк удалена. Для скрипта,
  который читает `max doctor --json`:
  - то, что знает только MAX (`token`, `keyring`, `session`, `profiles`, `bot`, `paths`, `client`, `install`, `native`,
    `speech`), теперь в `item.max`, а не в корне `item`;
  - `store`, `config`, `files` и `runs` остаются в корне, в общем виде cli-core;
  - `--online` больше не читает один чат. Вход проверяется общим `item.online`, сервер MCP и токен бота — в
    `item.online.checks`. Неудачная проверка — поле в ответе, код возврата `0` (раньше был `provider_error`).
  Советы (устаревший веб-клиент, сдвинутая ключница, пауза входа, бот, `PATH`) печатаются под ответом, как раньше.
  WireCat Desktop читает токен из `item.max` с версии, где есть wirecat-desktop#488.
