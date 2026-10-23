---
title: Catch up after a day away
goal: Know who waits on you and what you promised, without opening every chat.
steps:
  - run: max review 'date>1d' --unanswered 4h
    why: questions to you that nobody answered for four hours, across every chat
  - run: max inbox --new
    why: other people's messages that arrived since your last check, each one once
  - run: max tasks list
    why: questions, requests and promises the review kept, oldest first
look:
  - who asked first and how long ago
  - tasks whose source message is a promise of yours
---

`review` and `inbox` read MAX and save what they read, so `tasks list` and later searches work from the local
store. Add `--offline` to any of them to read only what is already saved.
