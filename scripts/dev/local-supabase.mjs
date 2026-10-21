// Helpers for local-only developer scripts. They read the running local
// Supabase stack's details from the CLI and refuse anything that is not local.
import { execFileSync } from "node:child_process";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLocalUrl(value, label = "Supabase URL") {
  const { hostname } = new URL(value);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `${label} is not local (${hostname}). These scripts only run against the local development stack.`,
    );
  }
}

/** `supabase status` as JSON, from the project's pinned CLI, without telemetry. */
export function localStatus() {
  const out = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(out.slice(out.indexOf("{")));
  for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
    if (!status[key])
      throw new Error(
        `Local Supabase did not report ${key}. Is it running? Try "corepack pnpm db:start".`,
      );
  }
  assertLocalUrl(status.API_URL);
  return status;
}
