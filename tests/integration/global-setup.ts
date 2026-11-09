import { execSync } from "node:child_process";

export default function setup() {
  // Apply all migrations to the dedicated test database (never the dev DB).
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://deepresearch:deepresearch@localhost:5432/deepresearch_test",
    },
  });
}
