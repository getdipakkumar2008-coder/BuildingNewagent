/**
 * Dev/test-only login bypass. It exists because OAuth credentials are not available
 * in local development. It must never be reachable in production.
 */
export function isDevLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEV_LOGIN === "1";
}
