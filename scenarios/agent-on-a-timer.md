---
title: Let an agent read MAX on a timer
goal: Get a summary of what needs your answer every morning, from an agent that cannot send.
steps:
  - run: max schedule command sync-chats --every 2h -- messages sync --all
    why: keeps every chat's history in the local store up to date, so the agent reads it offline
  - run: 'max schedule agent morning claude "run the daily follow-up review: max skill show follow-ups" --at 08:30'
    why: starts the agent at 08:30 with MAX_READ_ONLY=1, so it reads and drafts and never sends
  - run: max schedule list
    why: when each schedule runs next and how its last run went
look:
  - the last run's status for both schedules
  - the agent's kept answer, and the notification that it is ready
---

The agent runs under the lock, so any send it tries is refused before MAX is reached. Remove a schedule with
`max schedule remove <name>`.
