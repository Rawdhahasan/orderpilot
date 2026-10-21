// Resets a demo workspace for the next prospect (USER_FLOWS.md UF-13 scene 8).
// The current demo workspace is archived (never deleted) and a fresh copy with
// the same members, master data and opening stock takes over its address.
//   corepack pnpm ops:reset-demo <workspace-slug>
// Local stack only in this phase: the script refuses non-local Supabase URLs.
import { createClient } from "@supabase/supabase-js";

import { localStatus } from "../dev/local-supabase.mjs";

const [slug] = process.argv.slice(2);
if (!slug) {
  console.error("Usage: corepack pnpm ops:reset-demo <workspace-slug>");
  process.exit(1);
}
const status = localStatus();
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: org } = await admin
  .from("organizations")
  .select("id, is_demo")
  .eq("slug", slug)
  .eq("status", "active")
  .maybeSingle();
if (!org) {
  console.error("No active workspace with that slug.");
  process.exit(1);
}
if (!org.is_demo) {
  console.error("That workspace is not a demo workspace; it cannot be reset.");
  process.exit(1);
}
const { data, error } = await admin.rpc("reset_demo_workspace", { p_organization_id: org.id });
if (error) throw new Error(`Reset failed: ${error.message}`);
console.log(
  `Demo workspace "${slug}" reset. New workspace id: ${data}. The previous one is archived.`,
);
