import { orderedModels } from "@leemour/cli-messaging/speech"

export { findModel, type ModelFile, type SpeechModel, speechModel, VAD } from "@leemour/cli-messaging/speech"

export const DEFAULT_MODEL = "gigaam-v3"
export const SPEECH_MODELS = [DEFAULT_MODEL, "gigaam-v3-ctc", "parakeet-v3"]
export const MODELS = orderedModels(SPEECH_MODELS)
