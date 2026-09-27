import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is opened at 127.0.0.1. Dev HMR and client boot are blocked without this.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
