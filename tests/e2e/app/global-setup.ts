import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

import { AUTH_DIR, clearMail, localEnv, signIn, totp, USERS } from "./support";

const ROOT = join(__dirname, "../../..");

/**
 * Fresh, known state for every run: reset OrderPilot's LOCAL database (the
 * only database this ever touches), give the fictional seed users a random
 * password, enrol TOTP for both Owners, and save their signed-in sessions.
 * Alex Moreno and Rhys Okafor (Admins) are left without MFA on purpose.
 */
export default async function globalSetup(config: FullConfig) {
  localEnv();
  const env = {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    PATH: `${process.env.HOME}/.docker/bin:${process.env.PATH}`,
  };
  // Refuses unless the target is verified as OrderPilot's local database.
  execFileSync("node", ["scripts/dev/assert-local-db.mjs"], { cwd: ROOT, env, stdio: "inherit" });
  execFileSync("corepack", ["pnpm", "-s", "exec", "supabase", "db", "reset", "--local"], {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });

  const pass = randomBytes(12).toString("base64url");
  process.env.ORDERPILOT_E2E_PASSWORD = pass;
  execFileSync("node", ["scripts/dev/provision-users.mjs"], {
    cwd: ROOT,
    env: { ...env, ORDERPILOT_DEV_PASSWORD: pass },
    stdio: "ignore",
  });
  await clearMail();

  const { createClient } = await import("@supabase/supabase-js");
  const { supabaseUrl, publishableKey } = localEnv();
  for (const email of [USERS.nsOwner, USERS.bvOwner]) {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await client.auth.signInWithPassword({ email, password: pass });
    if (signedIn.error)
      throw new Error(`Setup sign-in failed for ${email}: ${signedIn.error.message}`);
    const enrolled = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "E2E authenticator",
    });
    if (enrolled.error) throw new Error(`Enrolment failed: ${enrolled.error.message}`);
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp(enrolled.data.totp.secret),
    });
    if (verified.error) throw new Error(`Enrolment verification failed: ${verified.error.message}`);
    process.env[`ORDERPILOT_E2E_TOTP_${email.split("@")[0]!.replace(/\W/g, "_").toUpperCase()}`] =
      enrolled.data.totp.secret;
    await client.auth.signOut({ scope: "local" });
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  for (const [name, email] of [
    ["nsOwner", USERS.nsOwner],
    ["bvOwner", USERS.bvOwner],
  ] as const) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const secret =
      process.env[`ORDERPILOT_E2E_TOTP_${email.split("@")[0]!.replace(/\W/g, "_").toUpperCase()}`]!;
    await signIn(page, email, { secret });
    await context.storageState({ path: join(AUTH_DIR, `${name}.json`) });
    await context.close();
  }
  await browser.close();
}
