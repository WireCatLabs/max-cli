# MIME после переноса download

Продолжение одобренных parity исправлений. Claim fix/parity-download-mime.
Adapter.download не сохраняет HTTP MIME; shared save выбирает photo fallback.jpg до bytes().
Добавить actual consumer fixture PHOTO + image/webp, воспроизвести расширение .jpg.
Передавать response MIME во время lazy bounded stream, общий save выбирает fallback после bytes.
Не открывать unused attachments заранее. Сохранить file names, бюджеты/redirect/stall/cleanup,
закрытие и no-overwrite. Shared prerequisite release, exact pin и consumer gates;
старые файлы и реальные аккаунты не затрагиваются.

## Command cancellation verification

Claim fix/download-close-streams. Verify that a command deadline closes an active attachment HTTP
stream through adapter ownership, not only the MAX WebSocket. Synthetic stalled server, bounded
probe/cleanup, no owner paths. If missing, adapter close aborts its lazy byte streams; watchdog
and global cancellation stay distinct. No shared SDK/schema changes or live operations.
