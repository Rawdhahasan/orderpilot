// Local development provisioning (D-03 allows this as the only path besides an
// invitation). Sets a password on the fictional seed users of the LOCAL stack
// so you can sign in. Usage:
//   ORDERPILOT_DEV_PASSWORD='at-least-12-chars' corepack pnpm db:provision
// Without ORDERPILOT_DEV_PASSWORD a random password is generated and shown once.
// Owners and Admins still have to enrol MFA on first sign-in (D-24).
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { localStatus } from "./local-supabase.mjs";

const SEED_DOMAINS = ["@northstar.example", "@bayview.example"];

const status = localStatus();
const password = process.env.ORDERPILOT_DEV_PASSWORD ?? randomBytes(12).toString("base64url");
if (password.length < 12)
  throw new Error("ORDERPILOT_DEV_PASSWORD must be at least 12 characters.");

const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
if (error) throw new Error(`Could not list local users: ${error.message}`);

const seedUsers = data.users.filter((u) => SEED_DOMAINS.some((d) => u.email?.endsWith(d)));
for (const user of seedUsers) {
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updateError)
    throw new Error(`Could not set the password for ${user.email}: ${updateError.message}`);
}
console.log(`Set a local password for ${seedUsers.length} fictional seed users.`);
if (!process.env.ORDERPILOT_DEV_PASSWORD)
  console.log(`Generated password (local only): ${password}`);
