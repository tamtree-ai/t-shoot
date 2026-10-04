// Build step of the standalone image: put Kokoro's weights in KOKORO_CACHE_DIR and speak once.
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

env.cacheDir = process.env.KOKORO_CACHE_DIR ?? ".kokoro";
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const out = await tts.generate("Ready.", { voice: "af_heart" });
console.log(`kokoro ready in ${env.cacheDir}: ${out.audio.length} samples`);
