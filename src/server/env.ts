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
  /** simulated: fictional fixtures only (tests, demos). gemini: Google Gemini (server-side only). */
  AI_EXTRACTION_PROVIDER: z.enum(["simulated", "gemini"]).default("simulated"),
  /** Never sent to the browser, logged or stored; read only by the Gemini provider. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z
    .string()
    .regex(/^[a-z0-9.-]{3,60}$/)
    .default("gemini-3.8-flash"),
  /** Tests point this at a local mock server; empty means Google's endpoint. */
  GEMINI_BASE_URL: z.url().optional(),
  // Free-tier safety: every AI call is reserved against these limits first.
  AI_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
  AI_MAX_REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(100000).default(100),
  AI_MAX_REQUESTS_PER_WORKSPACE_PER_DAY: z.coerce.number().int().min(1).max(100000).default(50),
  AI_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(15),
  AI_MAX_DOCUMENT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  /** Shorter than the 120-second job lease. */
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(110000).default(90000),
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
