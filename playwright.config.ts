import { defineConfig } from "@playwright/test";

/**
 * Track F6: Brief → Export on the mock. Needs Postgres up, migrated and seeded
 * (`pnpm db:up && pnpm db:migrate && pnpm db:seed`). The mock runs 200× faster so a clip
 * takes ~60ms; the worker (which holds the mock's runs) is started beside the app.
 *
 * `.env.local` may say `TAMTREE_ADAPTER=live`. These servers force the mock, and a
 * server already listening on 3100 is not reused: that process would keep the live
 * adapter and the journey would spend money.
 */
const mockEnv = {
  TAMTREE_ADAPTER: "mock",
  TAMSHOOT_E2E: "1",
  TAMSHOOT_MOCK_SCENARIO: "happy",
  TAMSHOOT_MOCK_SPEED: "200",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm exec next dev -p 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      env: mockEnv,
    },
    {
      command: "pnpm worker",
      wait: { stdout: /\[worker\] up/ },
      reuseExistingServer: false,
      env: mockEnv,
    },
  ],
});
