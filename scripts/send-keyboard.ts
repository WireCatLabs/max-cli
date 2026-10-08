/**
 * A bot sends one message with a test keyboard, for trying `messages press` by hand. See bin/bot-buttons.
 *
 *   node --experimental-strip-types scripts/send-keyboard.ts <bot profile> <chat id | user:<id>>
 *
 * One button of each kind the personal side treats differently: two callbacks (pressable), a link, a
 * message, and a phone request (refused). Prints the bot's message id, which `bot messages delete` takes.
 */
import { BotTokenStore } from "../dist/bot/auth.js"
import { BotApiClient, botOperations } from "../dist/bot/client.js"

const [profile, chat] = process.argv.slice(2)
if (!profile || !chat) {
  console.error("usage: bin/bot-buttons <bot profile> <chat id | user:<id>>")
  process.exit(2)
}
const stored = new BotTokenStore({ profile }).read()
if (!stored) {
  console.error(`no bot token on profile "${profile}" — run \`max ${profile} bot auth set\` first`)
  process.exit(2)
}
const sendMessage = botOperations.find((operation) => operation.id === "sendMessage")
if (!sendMessage) throw new Error("the manifest has no sendMessage")

const query: Record<string, string> = chat.startsWith("user:")
  ? { user_id: chat.slice("user:".length) }
  : { chat_id: chat }
const body = {
  text: "max-cli: test buttons",
  attachments: [
    {
      type: "inline_keyboard",
      payload: {
        buttons: [
          [
            { type: "callback", text: "Yes", payload: "test:yes" },
            { type: "callback", text: "No", payload: "test:no" },
          ],
          [{ type: "link", text: "MAX", url: "https://max.ru" }],
          [{ type: "message", text: "Say hi" }],
          [{ type: "request_contact", text: "Share phone" }],
        ],
      },
    },
  ],
}
const answer = (await new BotApiClient({ token: stored.token }).call(sendMessage, {
  query,
  body: JSON.stringify(body),
})) as { message?: { body?: { mid?: string } } }
console.log(answer.message?.body?.mid ?? "sent, but the answer carried no message id")
