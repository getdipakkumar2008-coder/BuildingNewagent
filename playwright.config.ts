import path from "node:path";
import { defineConfig } from "@playwright/test";

const FAKE_PORT = 4010;
// Known upload directory so tests can assert that deleting a chat removes the stored files.
export const E2E_UPLOAD_DIR = path.resolve("test-results", "e2e-uploads");

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: [
    {
      // Fake Anthropic API: e2e never calls the real service.
      command: `node tests/support/fake-anthropic.mjs ${FAKE_PORT}`,
      port: FAKE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm dev",
      url: "http://localhost:3000/signin",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DEV_LOGIN: "1",
        UPLOAD_DIR: E2E_UPLOAD_DIR,
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
        CHATS_PER_MINUTE: "1000",
        MAX_CONCURRENT_STREAMS: "5",
      },
    },
  ],
});
