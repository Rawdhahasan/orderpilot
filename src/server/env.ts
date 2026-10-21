import "server-only";

import { z } from "zod";

/**
 * Server environment (docs/TECHNICAL_ARCHITECTURE.md §7.4). Validated once;
 * the secret key is read only by src/server/privileged.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  APP_BASE_URL: z.url(),
  MAIL_TRANSPORT: z.enum(["mailpit"]).default("mailpit"),
  MAILPIT_URL: z.url().default("http://127.0.0.1:54324"),
  /** Authenticates calls to the internal worker route. */
  INTERNAL_JOB_SECRET: z.string().min(32),
  EXTRACTION_PROVIDER: z.enum(["simulated"]).default("simulated"),
  /** Fixture recognition by the simulated provider is limited to local and test (FR-EXT-03). */
  DEPLOYMENT_ENV: z.enum(["local", "test", "staging", "production"]).default("production"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      // Never print values: only which variables are missing or invalid.
      const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${names}. Run "corepack pnpm db:env".`);
    }
    cached = parsed.data;
  }
  return cached;
}
