# Выравнивание команд сообщений

Продолжение одобренного shared-code parity плана и поручения исправить расхождения.
Source baseline: MAX 2f2e37a, shared src/cli/messenger factories.

MAX src/commands/messages.ts сохраняет local download/scheduled и не монтирует evidence.
Adapter.download читает весь файл с voice budget 32 MiB; нужен streaming port с прежними
HTTPS/redirect/size/stall ограничениями.

Работы: shared evidence/scheduled/download; scheduled adapter capability;
--output как compatibility alias к --output-dir с отказом при конфликте;
streaming MAX transport с file budget; session end metadata mutates:true.
Docs описывают download JSON {items}, batch/resume и alias до реализации.

Проверки: synthetic consumer suites, regressions для файлов больше voice budget,
batch resume, local evidence без подключения; lint/typecheck/tests/generate/docs/parity/Bun/matrix.
Manifest отражает adoption и compatibility alias. No live account actions.
Permissions остаются T6/P7, hearing у текущего владельца.
