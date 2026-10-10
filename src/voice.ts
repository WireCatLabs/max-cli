import { CliError } from "@wirecat/cli-core"
import { decodeOgg } from "./transcribe/speech.js"

const BARS = 80

const isOggOpus = (bytes: Uint8Array): boolean => {
  const head = Buffer.from(bytes.subarray(0, 64)).toString("latin1")
  return head.startsWith("OggS") && head.includes("OpusHead")
}

/**
 * What a voice message carries besides the file, as web.max.ru builds it (`FIND-104`): its length
 * in milliseconds and 80 bars of loudness, 0–127. Computed here, so only the file leaves the machine.
 */
export const voiceOf = async (path: string, bytes: Uint8Array): Promise<{ durationMs: number; wave: Uint8Array }> => {
  if (!isOggOpus(bytes)) {
    throw new CliError(
      "validation_error",
      `${path} is not Ogg Opus, the format of a voice message — convert it first: ` +
        "ffmpeg -i <file> -ac 1 -ar 48000 -c:a libopus -b:a 32k voice.ogg",
    )
  }
  let decoded: { samples: Float32Array; rate: number }
  try {
    decoded = await decodeOgg(bytes)
  } catch {
    throw new CliError("validation_error", `${path} could not be decoded as Ogg Opus`)
  }
  const { samples, rate } = decoded
  const wave = new Uint8Array(BARS)
  const size = Math.max(1, Math.floor(samples.length / BARS))
  for (let bar = 0; bar < BARS; bar++) {
    let peak = 0
    for (let index = bar * size; index < Math.min(samples.length, (bar + 1) * size); index++) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0))
    }
    wave[bar] = Math.min(127, Math.round(peak * 127))
  }
  return { durationMs: Math.round((samples.length / rate) * 1000), wave }
}
