import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import type { Database } from "@/server/db/database.types";
import { serverEnv } from "@/server/env";

/**
 * Database reads must always be fresh. Next.js memoises identical GET fetches
 * within one render; a distinct abort signal (and no-store) opts out, so a
 * read after a write in the same request sees the write.
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? new AbortController().signal,
  });

/**
 * User-scoped Supabase client: every query runs as the signed-in user, so RLS
 * always applies (docs/TECHNICAL_ARCHITECTURE.md §4). The request ID is sent to
 * Postgres for the audit trail.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();
  const requestId = (await headers()).get("x-request-id") ?? undefined;

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
      global: { headers: requestId ? { "x-request-id": requestId } : {}, fetch: freshFetch },
    },
  );
}
