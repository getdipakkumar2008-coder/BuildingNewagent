import { z } from "zod";

/**
 * Server-side environment schema. Milestone-specific secrets are optional until their
 * milestone lands, so M0 boots without keys. Never prefix secrets with NEXT_PUBLIC_.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  UPLOAD_DIR: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SEARCH_PROVIDER: z.enum(["brave"]).default("brave"),
  BRAVE_API_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // Treat empty strings (from a copied .env.example) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const result = serverEnvSchema.safeParse(cleaned);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
