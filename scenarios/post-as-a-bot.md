---
title: Post as your bot
goal: Send a message to a group as your bot, through MAX's official Bot API, not from your own account.
steps:
  - run: max bot auth set
    why: checks the bot's token with MAX and keeps it; type it at the hidden prompt or pipe it on stdin
  - run: max bot chats list
    why: the chats this bot has seen on this machine, to pick the one to write to
  - run: max bot messages send Team "the release is out"
    why: sends the message as the bot; without the text it is read from stdin
look:
  - which bot `bot auth set` names, before anything is sent
  - the message id the send returns, to edit or pin it later
---

A bot needs its own token from MAX; your personal login is not used. `max bot recipients add` limits which chats the
bot may write to.
