import type { SharedContractOverride } from "@wirecat/cli-base/commands"

// Reviewed differences from Core. A changed default requires reviewing this declaration.
export const SHELL_OVERRIDES: Readonly<{
  doctor: readonly SharedContractOverride[]
  messages: readonly SharedContractOverride[]
  chats: readonly SharedContractOverride[]
  session: readonly SharedContractOverride[]
  setup: readonly SharedContractOverride[]
  serve: readonly SharedContractOverride[]
  contacts: readonly SharedContractOverride[]
  watch: readonly SharedContractOverride[]
}> = {
  doctor: [
    {
      command: ["doctor"],
      field: "options",
      before: [
        {
          flags: "--online",
          description: "also connect once and read the account; sends nothing",
          takes_value: false,
          mandatory: false,
        },
      ],
      after: [
        {
          flags: "--online",
          description: "also log in once, read one chat and start the MCP server; sends nothing",
          takes_value: false,
          mandatory: false,
        },
      ],
      reason:
        "MAX reports its own server, protocol library and installation while retaining the shared diagnostic defaults.",
    },
    {
      command: ["doctor", "reports", "show"],
      field: "description",
      before: "what a problem report holds; writes nothing",
      after: "what a problem report holds and where it goes; writes nothing",
      reason:
        "MAX reports its own server, protocol library and installation while retaining the shared diagnostic defaults.",
    },
    {
      command: ["doctor", "reports", "show"],
      field: "effects",
      before: {
        remote: "none",
        local: "none",
      },
      after: {
        remote: "read",
        local: "read",
      },
      reason:
        "MAX reports its own server, protocol library and installation while retaining the shared diagnostic defaults.",
    },
    {
      command: ["doctor", "reports", "create"],
      field: "description",
      before: "write a problem report to a file, and say where to send it",
      after: "write a problem report to a file, and print how to send it",
      reason:
        "MAX reports its own server, protocol library and installation while retaining the shared diagnostic defaults.",
    },
  ],
  messages: [
    {
      command: ["messages"],
      field: "description",
      before: "read and send messages",
      after: "read and send messages in a chat",
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages"],
      field: "children",
      before: [
        "evidence",
        "list",
        "send",
        "show",
        "context",
        "download",
        "transcribe",
        "edit",
        "delete",
        "forward",
        "pin",
        "unpin",
        "press",
        "scheduled",
        "link",
        "comments",
        "links",
        "sync",
      ],
      after: [
        "list",
        "show",
        "context",
        "links",
        "link",
        "download",
        "evidence",
        "sync",
        "transcribe",
        "send",
        "scheduled",
        "edit",
        "delete",
        "forward",
        "pin",
        "unpin",
        "press",
      ],
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages", "transcribe"],
      field: "summary",
      before: "transcribe one voice message",
      after: null,
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages", "transcribe"],
      field: "description",
      before: "a voice message as text — by MAX where it can, else by a model on this machine",
      after: "turn a voice message into text, on this machine — the recording goes nowhere",
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages", "transcribe"],
      field: "examples",
      before: ['max personal messages transcribe "Book club" 101'],
      after: null,
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages", "transcribe"],
      field: "arguments",
      before: [
        {
          name: "chat",
          required: true,
          variadic: false,
          description: "a chat: its id, or part of its title",
        },
        {
          name: "message",
          required: true,
          variadic: false,
          description: "the id of a voice message",
        },
      ],
      after: [
        {
          name: "chat",
          required: true,
          variadic: false,
          description: "chat id, or part of a chat name",
        },
        {
          name: "message",
          required: true,
          variadic: false,
          description: "id of a voice message",
        },
      ],
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
    {
      command: ["messages", "transcribe"],
      field: "options",
      before: [
        {
          flags: "--local",
          description: "use the model on this machine, never the messenger",
          takes_value: false,
          mandatory: false,
        },
        {
          flags: "--model <model>",
          description: "which downloaded model; implies --local (`models list`)",
          takes_value: true,
          mandatory: false,
        },
      ],
      after: [
        {
          flags: "--model <model>",
          description: "which downloaded speech model to use; `max models list kind:audio` shows them",
          takes_value: true,
          mandatory: false,
        },
      ],
      reason: "MAX keeps its native voice transcription transport beside the shared message commands.",
    },
  ],
  chats: [
    {
      command: ["chats"],
      field: "description",
      before: "the account's chats",
      after: "the chats this account is in",
      reason:
        "MAX composes shared chat leaves with its existing provider command groups; every metadata difference is deliberate.",
    },
    {
      command: ["chats"],
      field: "children",
      before: [
        "list",
        "events",
        "inspect",
        "show",
        "send-as",
        "documents",
        "members",
        "mark-read",
        "tracking",
        "create",
        "join",
        "leave",
        "update",
        "links",
        "requests",
        "admins",
        "folders",
        "rules",
        "moderate",
        "media",
        "mute",
        "unmute",
        "delete",
        "clear",
        "start",
        "app",
      ],
      after: [
        "list",
        "show",
        "documents",
        "events",
        "inspect",
        "join",
        "mark-read",
        "leave",
        "create",
        "members",
        "tracking",
        "admins",
        "update",
        "links",
        "requests",
        "folders",
        "rules",
        "moderate",
        "media",
        "mute",
        "unmute",
        "delete",
        "clear",
        "start",
        "app",
      ],
      reason:
        "MAX composes shared chat leaves with its existing provider command groups; every metadata difference is deliberate.",
    },
  ],
  session: [
    {
      command: ["session"],
      field: "description",
      before: "link this account, or end its login",
      after: "the stored MAX session for this profile",
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
    {
      command: ["session"],
      field: "effects",
      before: {
        remote: "none",
        local: "none",
      },
      after: null,
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
    {
      command: ["session", "start"],
      field: "description",
      before: "link this account",
      after: "log this profile in to MAX",
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
    {
      command: ["session", "start"],
      field: "arguments",
      before: [
        {
          name: "method",
          required: false,
          variadic: false,
          description: "login method",
        },
      ],
      after: [
        {
          name: "method",
          required: false,
          variadic: false,
          description: "token (pasted or piped), qr, qr-chrome or sms",
          choices: ["token", "qr", "qr-chrome", "sms"],
          default: "token",
        },
      ],
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
    {
      command: ["session", "start"],
      field: "options",
      before: [],
      after: [
        {
          flags: "--answer-stdin",
          description:
            "with --json and no terminal: print each question as a `needs` line on stderr and read its answer, one line, from stdin",
          takes_value: false,
          mandatory: false,
        },
        {
          flags: "--credential-storage <storage>",
          description:
            "where the token is kept: keyring (the default, which falls back to a private file by itself when no keyring works), or file, not recommended",
          takes_value: true,
          mandatory: false,
          choices: ["keyring", "file"],
          default: "keyring",
        },
      ],
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
    {
      command: ["session", "end"],
      field: "description",
      before: "end this account's login",
      after: "log this profile out on MAX's side and forget the session here",
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared session lifecycle.",
    },
  ],
  setup: [
    {
      command: ["setup"],
      field: "description",
      before: "set up the account and connect an agent",
      after: "set up your personal MAX account and connect your agent",
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared setup lifecycle.",
    },
    {
      command: ["setup"],
      field: "options",
      before: [
        {
          flags: "--agent <agent>",
          description: "install instructions for this agent",
          takes_value: true,
          mandatory: false,
        },
        {
          flags: "--method <method>",
          description: "login method",
          takes_value: true,
          mandatory: false,
        },
      ],
      after: [
        {
          flags: "--agent <agent>",
          description: "install the skill for this agent; asks at a terminal, otherwise none",
          takes_value: true,
          mandatory: false,
          choices: ["none", "codex", "cursor", "claude", "gemini", "all"],
        },
        {
          flags: "--method <method>",
          description: "how to log in when there is no session",
          takes_value: true,
          mandatory: false,
          choices: ["token", "qr", "qr-chrome", "sms"],
          default: "qr",
        },
      ],
      reason:
        "This provider binds its own account linking protocol, credential flow and typed receipt to the shared setup lifecycle.",
    },
  ],
  serve: [
    {
      command: ["serve"],
      field: "description",
      before: "keep the local store current until stopped — what a systemd or launchd unit runs",
      after: "stay connected to MAX and stream new messages to `max watch`, until Ctrl-C",
      reason:
        "MAX serves command subscribers through its native broker; scanner counters are unavailable, so it deliberately does not claim a serve_summary receipt.",
    },
    {
      command: ["serve"],
      field: "output",
      before: {
        entity: "serve_summary",
      },
      after: null,
      reason:
        "MAX serves command subscribers through its native broker; scanner counters are unavailable, so it deliberately does not claim a serve_summary receipt.",
    },
    {
      command: ["serve"],
      field: "examples",
      before: ["max personal serve"],
      after: null,
      reason:
        "MAX serves command subscribers through its native broker; scanner counters are unavailable, so it deliberately does not claim a serve_summary receipt.",
    },
    {
      command: ["serve"],
      field: "options",
      before: [],
      after: [
        {
          flags: "--idle <duration>",
          description: "stop after this long with nobody using it — 15m, 1h is 60m",
          takes_value: true,
          mandatory: false,
        },
        {
          flags: "--max-subscriber-buffer-bytes <bytes>",
          description: "buffer per watcher before disconnecting it; 0 is unlimited",
          takes_value: true,
          mandatory: false,
        },
        {
          flags: "--max-subscriber-total-buffer-bytes <bytes>",
          description: "combined watcher buffer budget; 0 is unlimited",
          takes_value: true,
          mandatory: false,
        },
      ],
      reason:
        "MAX serves command subscribers through its native broker; scanner counters are unavailable, so it deliberately does not claim a serve_summary receipt.",
    },
  ],
  contacts: [
    {
      command: ["contacts"],
      field: "description",
      before: "people this account has a one-to-one chat with",
      after: "people you have a one-to-one chat with",
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts"],
      field: "children",
      before: [
        "list",
        "show",
        "context",
        "prepare",
        "events",
        "check",
        "link",
        "unlink",
        "lookup",
        "sync",
        "aliases",
        "notes",
        "add",
        "remove",
        "block",
        "unblock",
        "rename",
        "import",
      ],
      after: [
        "list",
        "show",
        "aliases",
        "notes",
        "sync",
        "lookup",
        "add",
        "remove",
        "block",
        "unblock",
        "rename",
        "import",
        "context",
        "prepare",
        "events",
        "check",
        "link",
        "unlink",
      ],
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "sync"],
      field: "description",
      before: "take the whole contact list from the messenger into the local store",
      after: "forget where the last sync left off and take the whole list again",
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "sync"],
      field: "examples",
      before: ["max personal contacts sync"],
      after: null,
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "lookup"],
      field: "summary",
      before: "find an account by a phone number",
      after: null,
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "lookup"],
      field: "description",
      before: "who has this phone number — asks for it, or reads it from stdin; never an argument",
      after: "who MAX has under a phone number — asks for it, or reads it from stdin",
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "lookup"],
      field: "arguments",
      before: [],
      after: [
        {
          name: "phone",
          required: false,
          variadic: false,
          description: "refused: the number is asked for, never typed here",
        },
      ],
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
    {
      command: ["contacts", "lookup"],
      field: "examples",
      before: ["max personal contacts lookup"],
      after: null,
      reason:
        "MAX keeps its native contact lookup and full sync transport while inheriting the shared contact contract defaults.",
    },
  ],
  watch: [
    {
      command: ["watch"],
      field: "description",
      before: "print new messages as they arrive, until Ctrl-C or --timeout (either ends it normally)",
      after: "print new messages as they arrive, from a running `max serve`",
      reason:
        "MAX watch reads its native broker subscription and retains its provider event selectors while following the shared stream envelope.",
    },
    {
      command: ["watch"],
      field: "options",
      before: [
        {
          flags: "--events",
          description: "include changes and receipts; each item names its event",
          takes_value: false,
          mandatory: false,
        },
      ],
      after: [
        {
          flags: "--events",
          description:
            "also print edits, deletions, reactions, reads and chat changes; every line then names its event",
          takes_value: false,
          mandatory: false,
        },
      ],
      reason:
        "MAX watch reads its native broker subscription and retains its provider event selectors while following the shared stream envelope.",
    },
  ],
}
