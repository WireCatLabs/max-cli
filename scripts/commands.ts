/**
 * Writes `docs/commands.md` from the command tree itself (`OPS-10`).
 *
 *   pnpm generate
 *
 * **Nobody writes that page by hand.** A reference that can be forgotten lies with the confidence
 * of a real one, and the person it lies to is the one who cannot read the source. `pnpm generate`
 * rewrites it and CI asserts the tree did not change, exactly as it does for `protocol.md`.
 *
 * It imports from `dist/` for the same reason `generate.ts` does: Node's type stripping will not
 * resolve a `.js` specifier to a `.ts` file, so `pnpm generate` builds first.
 *
 * ⚠ **The page's own words are Russian; everything quoted out of the program is English**
 * (`NEED-108`). Option and command descriptions are reproduced exactly as `max --help` prints
 * them — translating them here would give the same sentence two homes, and the one on screen
 * would be the one nobody corrected.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { COMMANDS_PAGE_LABELS, commandsPage, describeOptions, describeProgram } from "@wirecat/cli-core/commands"
import { createProgram } from "../dist/program.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const program = createProgram()

const page = commandsPage({
  cli: "max",
  commands: describeProgram(program),
  options: describeOptions(program),
  labels: COMMANDS_PAGE_LABELS.ru,
  text: {
    banner: "<!-- Сгенерировано из дерева команд скриптом scripts/commands.ts. Не редактировать; `pnpm generate`. -->",
    title: "Команды",
    intro: `Справочник: каждая команда, каждая опция, каждый код возврата. Страница **собирается из самой
программы**, поэтому описать версию, которой не существует, она не может.

\`chats send-as\` и \`--send-as\` пока недоступны для MAX: команда откажет до отправки.

Как устроена строка:

\`\`\`sh
max [профиль] [опции] <команда> <действие> [аргументы]
\`\`\`

**Первое слово — профиль**, если оно не совпадает с именем команды: \`max personal chats list\`
читает чаты профиля \`personal\`, а \`max chats list\` — профиля по умолчанию. То же самое говорит
переменная \`MAX_PROFILE\`; без неё профиль называется \`default\`.

⚠ Описания команд и опций ниже — ровно те, что печатает \`max --help\`, то есть по-английски. Это
не недоработка перевода: текст живёт в программе, и второй его копии здесь быть не должно.`,
    globalHeading: "Общие опции",
    globalIntro: "Действуют на любую команду.",
    mutates: "**Меняет что-то в MAX.**",
    mutatesLocal: "**Меняет что-то только на этом компьютере.**",
    exitHeading: "Коды возврата",
    exitIntro: "Скрипт ветвится по коду, а не по тексту: текст меняется, код — нет.",
    outro: `\`0\` и только \`0\` означает, что операция выполнена. \`14\` — \`outcome_unknown\` — означает, что
сообщение **могло** уйти: не отправлено и не провалено, и повторять его можно только с тем же
\`--send-id\`.`,
  },
})

writeFileSync(join(root, "docs/commands.md"), page)

execFileSync("pnpm", ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", "docs/commands.md"], {
  cwd: root,
  stdio: "ignore",
  // pnpm is a .cmd script on Windows, which only a shell starts.
  shell: process.platform === "win32",
})

console.log("generated docs/commands.md from the command tree")
