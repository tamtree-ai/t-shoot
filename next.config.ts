import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is opened at 127.0.0.1. Dev HMR and client boot are blocked without this.
  allowedDevOrigins: ["127.0.0.1"],
  // Playwright uses its own output so `pnpm dev` can stay up.
  distDir: process.env.TAMSHOOT_DIST_DIR || ".next",
};

export default nextConfig;
