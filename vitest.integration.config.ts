import { defineConfig } from "vitest/config";
import path from "node:path";

export const TEST_DATABASE_URL =
  "postgresql://deepresearch:deepresearch@localhost:5432/deepresearch_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test" },
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
