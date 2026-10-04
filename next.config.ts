import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is opened at 127.0.0.1. Dev HMR and client boot are blocked without this.
  allowedDevOrigins: ["127.0.0.1"],
  // Playwright uses its own output so `pnpm dev` can stay up.
  distDir: process.env.TAMSHOOT_DIST_DIR || ".next",
  // Standalone mode's Kokoro runs on onnxruntime's native binding: load it from node_modules, never bundle it.
  serverExternalPackages: ["kokoro-js", "@huggingface/transformers", "onnxruntime-node", "phonemizer"],
};

export default nextConfig;
