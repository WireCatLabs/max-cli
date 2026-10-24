---
title: Find what someone said
goal: Get back a message, a file or a voice note when you remember only a word or the person.
steps:
  - run: max search all "invoice"
    why: messages, notes, the text of files and voice transcripts in one search, best match first
  - run: max contacts events Anna
    why: everything one person wrote or was mentioned in, newest first, from the store
  - run: max messages context Team 1234
    why: the message a hit points to, with what came either side of it
look:
  - the chat and the time of each hit
  - the msg locator, to cite it or to open the message
---

A search finds only what the store holds. Run `max messages sync --all` once, or `max schedule command` on a timer,
so older history is there to find.
