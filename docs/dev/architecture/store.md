# The store and search

Detail for [`ARCHITECTURE.md`](../ARCHITECTURE.md) §15 and §16.
**Correction 2026-10-03 (T6):** the per-profile cache and its schema are removed. The shared
cli-messaging store owns `messages.db`; max never opens the legacy profile database.

## A group member is a person, not a contact

The login record saves account-scoped people and membership snapshots. A dialog partner is a
contact; a group member is a known person, but is not listed as a contact merely for that reason.
Shared people services answer contact lists and cards from these relationships.

Missing `participants` means MAX did not restate membership; it does not mean an empty group.
A channel's short participant list is not stored as its whole membership.

## Shared migrations

Shared store migrations belong to cli-messaging and are forward-only. A branch build and every test must set `MESSAGING_STORE` to
an isolated file; neither may migrate the owner's store.

## It never fails the command

Login recording is best effort. A failed save warns without losing the live answer, and the
contact marker stays put so the next login can request the same changes. Shared adapter storage
also keeps a failed history write from failing a completed network read.

## Searching: why FTS5 and not LIKE

Search now belongs to the shared services, including query validation and indexing. It searches
only the account's recorded history. Offline search never opens a MAX connection. Fetch history
with `max store fetch` to make older messages available.

## Departed chats

Only a complete nonempty chat snapshot marks missing chats as left. Cut and empty snapshots keep
previous chats. `max store clear --left` previews the data; `--allow-dangerous` removes it.
There is no whole-store wipe command. `max doctor` names any remaining legacy profile file;
its data is not migrated into the shared store.
