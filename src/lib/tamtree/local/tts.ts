/**
 * Voices for the local adapter's stick-produce (standalone plan §5): Kokoro in this process by
 * default, or any OpenAI-compatible `POST /audio/speech` (LOCAL_TTS_BASE_URL). Free, so a run's
 * cost stays 0.
 *
 * Workspace settings keep the Gemini voice names Tamtree uses (`STICK_VOICES`). They are mapped
 * to Kokoro voices here, so settings saved under Tamtree keep working. A Kokoro id
 * (`af_heart`, `am_puck`, …) passes through as it is.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { KOKORO_FOR } from "@/types/stick-skit/catalog";

export interface Tts {
  readonly id: string;
  /** One line as 16-bit PCM WAV bytes. */
  speak(text: string, voice: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export { KOKORO_FOR };

/** The fallback voice when a line has none: the flows' `default_voice` (Zephyr), mapped. */
export const LOCAL_DEFAULT_VOICE = KOKORO_FOR.Zephyr!;

const KOKORO_ID = /^[ab][fm]_[a-z]+$/;

/** A saved voice name → the voice this TTS speaks with. */
export const localVoice = (name: string | undefined): string => {
  if (!name) return LOCAL_DEFAULT_VOICE;
  if (KOKORO_ID.test(name)) return name;
  return KOKORO_FOR[name] ?? LOCAL_DEFAULT_VOICE;
};

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Where Kokoro's weights live: baked into the Docker image, else the same cache StickStage's CLI uses. */
export const kokoroCacheDir = (env: NodeJS.ProcessEnv = process.env) => env.KOKORO_CACHE_DIR || path.join(os.homedir(), ".cache", "stickstage", "kokoro");

export const pcm16Wav = (samples: Float32Array, rate: number): Uint8Array => {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([head, data]));
};

type KokoroModel = { generate(text: string, o: { voice: string }): Promise<{ audio: Float32Array; sampling_rate: number }>; voices: Record<string, unknown> };
const g = globalThis as unknown as { __tamshootKokoro?: Promise<KokoroModel> };

/** Kokoro, loaded once per process (q8 on the CPU). */
export const kokoroTts = (): Tts => ({
  id: `kokoro-js:${KOKORO_MODEL}:q8`,
  speak: async (text, voice) => {
    g.__tamshootKokoro ??= (async () => {
      const [mod, transformers] = await Promise.all([import("kokoro-js"), import("@huggingface/transformers")]).catch(() => {
        throw new Error("Kokoro is not installed (kokoro-js is optional). Run pnpm install, or set LOCAL_TTS_BASE_URL.");
      });
      const dir = kokoroCacheDir();
      fs.mkdirSync(dir, { recursive: true });
      transformers.env.cacheDir = dir;
      return (await mod.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: "q8", device: "cpu" })) as unknown as KokoroModel;
    })().catch((e) => {
      g.__tamshootKokoro = undefined;
      throw e;
    });
    const tts = await g.__tamshootKokoro;
    if (!(voice in tts.voices)) throw new Error(`"${voice}" is not a Kokoro voice.`);
    const out = await tts.generate(text, { voice });
    return pcm16Wav(out.audio, out.sampling_rate);
  },
});

/** Any OpenAI-compatible speech endpoint, asked for WAV (Kokoro-FastAPI, OpenAI). */
export const httpTts = (baseUrl: string, opts: { model?: string; apiKey?: string; fetch?: typeof fetch } = {}): Tts => {
  const base = baseUrl.replace(/\/+$/, "");
  const model = opts.model ?? "kokoro";
  const f = opts.fetch ?? fetch;
  return {
    id: `http:${base}:${model}`,
    speak: async (text, voice, signal) => {
      const res = await f(`${base}/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({ model, input: text, voice, response_format: "wav" }),
        signal,
      });
      if (!res.ok) throw new Error(`The speech endpoint ${base} answered ${res.status}.`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF") throw new Error(`The speech endpoint ${base} did not return a WAV file.`);
      return bytes;
    },
  };
};

export const ttsFromEnv = (env: NodeJS.ProcessEnv = process.env): Tts =>
  env.LOCAL_TTS_BASE_URL ? httpTts(env.LOCAL_TTS_BASE_URL, { model: env.LOCAL_TTS_MODEL, apiKey: env.LOCAL_TTS_API_KEY }) : kokoroTts();

/** Duration of a 16-bit PCM WAV from its header, in ms (0 when it can't tell). */
export const wavMs = (wav: Uint8Array): number => {
  const b = Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength);
  if (b.toString("ascii", 0, 4) !== "RIFF") return 0;
  let at = 12;
  let rate = 0;
  let block = 0;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") {
      rate = b.readUInt32LE(at + 12);
      block = b.readUInt16LE(at + 20);
    } else if (id === "data" && rate && block) return Math.round((Math.min(size, b.length - at - 8) / block / rate) * 1000);
    at += 8 + size + (size % 2);
  }
  return 0;
};
