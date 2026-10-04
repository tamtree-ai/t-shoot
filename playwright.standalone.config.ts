import { defineConfig } from "@playwright/test";

/**
 * Standalone quickstart check (standalone plan §7): against the running
 * `docker compose -f compose.standalone.yml` stack on :3007. Starts no server of its own, and
 * spends nothing (Kokoro and StickStage run locally).
 */
export default defineConfig({
  testDir: "./e2e-standalone",
  timeout: 10 * 60_000,
  workers: 1,
  use: { baseURL: process.env.TSHOOT_URL ?? "http://localhost:3007", trace: "retain-on-failure" },
});
