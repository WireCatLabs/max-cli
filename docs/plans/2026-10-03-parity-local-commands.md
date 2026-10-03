# Общие локальные команды

Продолжение одобренного parity плана. Claim refactor/parity-local-commands.
MAX src/commands/sends.ts задаёт собственный default limit20, игнорируя config limit;
shared sendsCommand использует общий resolver и тот же journal path.
MAX src/commands/skill.ts вызывает cli-core напрямую без shared named skills.

Подключить shared factories для sends и skill, сохранить MAX agent help.
JSON sends list нормализовать к shared configured-limit envelope; документация до code.
Проверки: configured limit, explicit limit, journal unchanged/no connection; named skill,
unknown skill, default skill; lint/typecheck/test/generate/docs/parity/Bun/matrix.
Нет account calls/permission changes. Не затрагивает P7 runtime/guard.
