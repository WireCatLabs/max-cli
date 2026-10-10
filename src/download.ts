import { randomUUID } from "node:crypto"
import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import { createWriteStream } from "node:fs"
import { link, rm } from "node:fs/promises"
import { BlockList, isIP, type LookupFunction } from "node:net"
import { basename, join } from "node:path"
import { PassThrough, Readable, Transform, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { CliError } from "@wirecat/cli-core"
import { Agent, fetch as connectionFetch } from "undici"
import type { AttachmentLink } from "./domain/models.js"
import { WEB_USER_AGENT } from "./spec/identity.js"

export interface Saved {
  kind: string
  path: string
  bytes: number
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
}

/**
 * A name MAX gave cannot climb out of the directory, cannot be a dot file we would then hide, and
 * carries no control or direction character to rewrite the terminal or disguise its extension.
 */
const safeName = (name: string | undefined): string | undefined => {
  const plain =
    name === undefined
      ? ""
      : basename(name.replaceAll("\\", "/"))
          .replace(/[\p{Cc}\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu, "")
          .replace(/^\.+/, "")
  return plain === "" ? undefined : plain
}

/** Where a download may go; throws for a link it must not follow. */
export type Reach = (url: URL) => Promise<void>

/**
 * **Out to the internet only, over https** (`NEED-278`). A link comes from MAX, and one pointing at
 * this machine or its network would make `max` a way to read what only this machine can reach.
 * Checked again after every redirect.
 */
export const publicAddresses = async (url: URL, resolve = lookup) => {
  if (url.protocol !== "https:") {
    throw new CliError("validation_error", `a ${url.protocol} link is not downloaded — only https`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const family = isIP(host)
  const addresses = family ? [{ address: host, family }] : await resolve(host, { all: true, verbatim: true })
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => PRIVATE.check(address, family === 6 ? "ipv6" : "ipv4"))
  ) {
    throw new CliError(
      "validation_error",
      `the link points into this machine or its network (${url.hostname}) — not downloaded`,
    )
  }
  return addresses
}

export const publicOnly: Reach = async (url) => {
  await publicAddresses(url)
}

export const pinnedLookup =
  (addresses: readonly LookupAddress[]): LookupFunction =>
  (_hostname, options, done) => {
    const eligible = options.family ? addresses.filter(({ family }) => family === options.family) : [...addresses]
    if (options.all) return done(null, eligible)
    const selected = eligible[0]
    if (!selected) return done(new Error("the download host has no address for this family"), "", 0)
    done(null, selected.address, selected.family)
  }

const PRIVATE = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 29],
  ["192.0.0.170", 31],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  PRIVATE.addSubnet(network, prefix, "ipv4")
// `::ffff:127.0.0.1` is matched against the IPv4 rules by BlockList itself, under Node and Bun alike.
for (const [network, prefix] of [
  ["::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(network, prefix, "ipv6")

/** MAX takes attachments up to 4 GB (help.max.ru, "Как отправить в чат фото и другие файлы"). */
const LARGEST_ATTACHMENT = 4 * 1024 ** 3

/** A voice message is read into memory whole; minutes of Opus are a few megabytes. */
export const LARGEST_VOICE = 32 * 1024 * 1024

/** No byte for this long and the download is given up — however large the file, it is moving or not. */
export const STALL_MS = 60_000

export interface Watchdog {
  readonly signal: AbortSignal
  poke(): void
  stop(): void
}

/** An abort signal that fires when `poke` has not been called for `ms`. */
export const watchdog = (ms: number): Watchdog => {
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    poke: () => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), ms)
    },
    stop: () => clearTimeout(timer),
  }
}

const REDIRECTS = 5

const HEADERS = { "User-Agent": WEB_USER_AGENT.headerUserAgent, Referer: "https://web.max.ru/" }

/** The body of the link, at most `limit` bytes, with redirects followed by hand so each is checked. */
const open = async (
  attachment: AttachmentLink,
  reach: Reach,
  limit: number,
  parentSignal?: AbortSignal,
): Promise<{ response: Response; pump: (destination: Writable) => Promise<number> }> => {
  const stalled = watchdog(STALL_MS)
  const signal = parentSignal ? AbortSignal.any([stalled.signal, parentSignal]) : stalled.signal
  let agent: Agent | undefined
  const release = async () => {
    const owned = agent
    agent = undefined
    await owned?.destroy()
  }
  const failed = async (error: unknown): Promise<never> => {
    await release()
    stalled.stop()
    if (stalled.signal.aborted) {
      throw new CliError("timeout", `the ${attachment.kind} download stopped moving for ${STALL_MS / 1000} s`)
    }
    throw error
  }

  let target = new URL(attachment.url)
  for (let hop = 0; ; hop += 1) {
    const response = await (async () => {
      if (reach !== publicOnly) {
        await reach(target)
        return fetch(target, { headers: HEADERS, redirect: "manual", signal })
      }
      const addresses = await publicAddresses(target)
      agent = new Agent({ connect: { autoSelectFamily: true, lookup: pinnedLookup(addresses) } })
      return connectionFetch(target, {
        headers: HEADERS,
        redirect: "manual",
        signal,
        dispatcher: agent,
      }) as unknown as Promise<Response>
    })().catch(failed)
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      await release()
      if (hop >= REDIRECTS)
        await failed(new CliError("network_error", `the ${attachment.kind} link redirects too many times`))
      target = new URL(location, target)
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      await failed(
        new CliError("network_error", `the ${attachment.kind} could not be downloaded: HTTP ${response.status}`),
      )
    }
    const declared = Number(response.headers.get("content-length") ?? Number.NaN)
    if (declared > limit) {
      await response.body?.cancel()
      await failed(tooLarge(attachment, limit))
    }

    let bytes = 0
    const counting = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        stalled.poke()
        bytes += chunk.length
        done(bytes > limit ? tooLarge(attachment, limit) : null, chunk)
      },
    })
    const source = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream)
    const pump = (destination: Writable): Promise<number> =>
      pipeline(source, counting, destination).then(async () => {
        await release()
        stalled.stop()
        return bytes
      }, failed)
    return { response, pump }
  }
}

const tooLarge = (attachment: AttachmentLink, limit: number) =>
  new CliError(
    "validation_error",
    `the ${attachment.kind} is larger than ${limit >= 1024 ** 2 ? `${Math.round(limit / 1024 ** 2)} MiB` : `${Math.round(limit / 1024)} KiB`} — not downloaded`,
  )

/** General attachments stream with a file budget; voice transcription keeps its smaller memory budget. */
export const streamBytes = async function* (
  attachment: AttachmentLink,
  reach: Reach = publicOnly,
  limit = LARGEST_ATTACHMENT,
  onMime?: (mime: string | undefined) => void,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const { pump, response } = await open(attachment, reach, limit, signal)
  const body = new PassThrough()
  const finished = pump(body).catch((error: unknown) => {
    body.destroy(error instanceof Error ? error : new Error("attachment download failed"))
    throw error
  })
  // The stream reports failures to its reader; observe the pump immediately as well.
  void finished.catch(() => {})
  try {
    onMime?.(response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase())
    for await (const chunk of body) yield chunk as Buffer
    await finished
  } finally {
    body.destroy()
    await finished.catch(() => {})
  }
}

/** Into memory rather than a file: a voice message is a few hundred kilobytes, and transcription reads it once. */
export const fetchBytes = async (
  attachment: AttachmentLink,
  reach: Reach = publicOnly,
  limit = LARGEST_VOICE,
): Promise<Uint8Array> => {
  const { pump } = await open(attachment, reach, limit)
  const chunks: Buffer[] = []
  await pump(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk)
        done()
      },
    }),
  )
  return new Uint8Array(Buffer.concat(chunks))
}

/**
 * Downloads one attachment into `directory` and **never replaces a file that is there**.
 *
 * The bytes go to a temporary name first and are then hard-linked to the real one, which fails if
 * the name is taken — so an existing file survives, and an interrupted download leaves no half
 * file under the name somebody will open.
 */
export const save = async (
  attachment: AttachmentLink,
  directory: string,
  fallbackName: string,
  reach: Reach = publicOnly,
): Promise<Saved> => {
  const { response, pump } = await open(attachment, reach, LARGEST_ATTACHMENT)

  const extension = EXTENSIONS[response.headers.get("content-type")?.split(";")[0]?.trim() ?? ""]
  const name = safeName(attachment.name) ?? (extension ? `${fallbackName}.${extension}` : fallbackName)
  const path = join(directory, name)
  const partial = join(directory, `.${name}.${randomUUID()}.part`)

  try {
    const bytes = await pump(createWriteStream(partial, { flags: "wx", mode: 0o600 }))
    await link(partial, path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        throw new CliError("validation_error", `${path} already exists — nothing was overwritten; choose --output`)
      }
      throw error
    })
    return { kind: attachment.kind, path, bytes }
  } finally {
    await rm(partial, { force: true })
  }
}
