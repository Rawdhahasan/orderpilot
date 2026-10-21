import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/server/db/database.types";
import { serverEnv } from "@/server/env";

/**
 * The only module allowed to use the secret (service-role) key
 * (docs/TECHNICAL_ARCHITECTURE.md §7.3). It bypasses RLS, so it is used only
 * for: issuing invitation tokens, describing an invitation from its link, and
 * creating the account of a person accepting an invitation. Never import it
 * from client code; ESLint and server-only enforce this.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
