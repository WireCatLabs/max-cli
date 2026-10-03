# Account reads parity

Продолжение одобренного shared-code parity плана. Claim refactor/parity-account-reads.
MAX src/commands/account.ts сохраняет собственный show; adapter.me теряет phone/description.
Shared accountCommand уже маскирует номер и поддерживает --show-phone.

Подключить общую account group, вернуть profile поля из adapter.me плюс username:null.
Сохранить description MAX и все прежние поля; JSON добавляет username:null.
MAX contacts lookup, в отличие от общей команды TG, повторяет лишний аргумент в ошибке Commander:
принимать excess args только для своей privacy-safe проверки; отказаться до prompt/connection,
никогда не повторяя введённый номер. Lookup prompt и протокольный sync marker остаются host-owned.

Проверки: existing account/masking suites, adapter profile shape, argv phone absent stdout/stderr/run logs,
no LOGIN/CONTACT_INFO_BY_PHONE on refusal; lint/typecheck/test/generate/docs/parity/Bun/matrix.
Нет изменений permission runtime/MCP или live account calls.
