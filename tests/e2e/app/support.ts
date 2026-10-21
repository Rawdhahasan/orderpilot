import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Local stack details, read from the git-ignored .env.local written by `db:env`. */
export function localEnv() {
  const text = readFileSync(join(__dirname, "../../../.env.local"), "utf8");
  const env = Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  ) as Record<string, string>;
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("App E2E tests run against the local stack only.");
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    secretKey: env.SUPABASE_SECRET_KEY!,
    mailpitUrl: env.MAILPIT_URL ?? "http://127.0.0.1:54324",
  };
}

export const AUTH_DIR = join(__dirname, "../.auth");

/** Fictional seed users (supabase/seed.sql). */
export const USERS = {
  nsOwner: "sofia.brandt@northstar.example",
  nsAdmin: "alex.moreno@northstar.example",
  nsApprover: "priya.raman@northstar.example",
  nsProcessor: "jordan.ellis@northstar.example",
  nsInventory: "marc.dubois@northstar.example",
  nsViewer: "sam.patel@northstar.example",
  bvOwner: "imogen.hale@bayview.example",
  bvAdmin: "rhys.okafor@bayview.example",
  bvApprover: "freya.lund@bayview.example",
  bvProcessor: "owen.pryce@bayview.example",
  bvInventory: "tariq.begum@bayview.example",
  bvViewer: "ellie.marsh@bayview.example",
} as const;

export function password(): string {
  const value = process.env.ORDERPILOT_E2E_PASSWORD;
  if (!value) throw new Error("Global setup did not provide a password.");
  return value;
}

export function totpSecret(email: string): string {
  const value =
    process.env[`ORDERPILOT_E2E_TOTP_${email.split("@")[0]!.replace(/\W/g, "_").toUpperCase()}`];
  if (!value) throw new Error(`No TOTP secret for ${email}.`);
  return value;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

let clockOffsetMs: number | undefined;

/**
 * Milliseconds the local Auth container's clock differs from this machine's.
 * Docker Desktop's VM clock can drift after the host sleeps; codes must match
 * the server's clock, as a phone's would match a correctly synced server.
 */
function authClockOffset(): number {
  if (clockOffsetMs === undefined) {
    const server = Number(
      execFileSync("docker", ["exec", "supabase_auth_orderpilot", "date", "+%s"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${process.env.HOME}/.docker/bin:${process.env.PATH}` },
      }).trim(),
    );
    clockOffsetMs = server * 1000 - Date.now();
  }
  return clockOffsetMs;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as authenticator apps compute it. */
export function totp(secret: string, at = Date.now() + authClockOffset()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

export function adminClient() {
  const env = localEnv();
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A signed-in API client for direct database checks, optionally verified to AAL2. */
export async function userClient(email: string, withMfa = false) {
  const env = localEnv();
  const client = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: password() });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  if (withMfa) {
    const { data } = await client.auth.mfa.listFactors();
    const factor = data!.totp[0]!;
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totp(totpSecret(email)),
    });
    if (verified.error) throw new Error(`MFA failed for ${email}: ${verified.error.message}`);
  }
  return client;
}

/** Runs SQL as the postgres superuser inside OrderPilot's local database container only. */
export function localSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_orderpilot",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${process.env.HOME}/.docker/bin:${process.env.PATH}` },
    },
  ).trim();
}

/** Signs in through the real form. Pass a TOTP secret for users with MFA. */
export async function signIn(
  page: Page,
  email: string,
  options: { secret?: string; next?: string; password?: string } = {},
) {
  await page.goto(options.next ? `/sign-in?next=${encodeURIComponent(options.next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(options.password ?? password());
  await page.getByRole("button", { name: "Sign in" }).click();
  if (options.secret) {
    await expect(page).toHaveURL(/\/sign-in\/verify/, { timeout: 15_000 });
    await page.getByLabel("Authentication code").fill(totp(options.secret));
    await page.getByRole("button", { name: "Verify" }).click();
    const refused = formAlert(page).filter({ hasText: "That code is not valid" });
    await expect(page)
      .not.toHaveURL(/\/sign-in/, { timeout: 15_000 })
      .catch(async () => {
        // A code is single-use per window: if it was just used (for example at
        // enrolment), wait for the next 30-second code, as a person would.
        if (!(await refused.isVisible()))
          throw new Error(`Verification did not complete for ${email}.`);
        const now = Date.now() + authClockOffset();
        await page.waitForTimeout(30_000 - (now % 30_000) + 1_000);
        await page.getByLabel("Authentication code").fill(totp(options.secret!));
        await page.getByRole("button", { name: "Verify" }).click();
      });
  }
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
}

/** A browser context already signed in as one of the users saved by global setup. */
export async function signedInPage(browser: Browser, name: "nsOwner" | "bvOwner") {
  const context = await browser.newContext({ storageState: join(AUTH_DIR, `${name}.json`) });
  return context.newPage();
}

type MailSummary = { ID: string; Subject: string; To: { Address: string }[] };

/** Waits for the newest local Mailpit message to an address and returns its first link matching `pattern`. */
export async function linkFromMail(to: string, pattern: RegExp, subject?: RegExp): Promise<string> {
  const { mailpitUrl } = localEnv();
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const body = (await res.json()) as { messages: MailSummary[] };
    const message = body.messages.find((m) => !subject || subject.test(m.Subject));
    if (message) {
      const detail = (await (await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const html = detail.HTML.replaceAll("&amp;", "&");
      const match = html.match(pattern) ?? detail.Text.match(pattern);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} matching ${pattern}.`);
}

export async function clearMail() {
  await fetch(`${localEnv().mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

/** A form's alert message (Next.js also renders an empty route announcer with role="alert"). */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
