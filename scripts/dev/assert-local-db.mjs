// Refuses to continue unless the database target is verified to be
// OrderPilot's LOCAL development database. Runs before every reset, database
// test run and end-to-end reset. Usage: node scripts/dev/assert-local-db.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { localTargetProblems } from "./local-target.mjs";

const root = new URL("../../", import.meta.url);
const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]*)"/m)?.[1];
const refFile = new URL("supabase/.temp/project-ref", root);
const linkedProjectRef = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : null;

const env = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
  // The project's pinned CLI and Docker Desktop's binaries, wherever this runs from.
  PATH: [
    new URL("node_modules/.bin", root).pathname,
    `${process.env.HOME}/.docker/bin`,
    process.env.PATH,
  ].join(":"),
};
let status = {};
let containerRunning = false;
try {
  const out = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  status = JSON.parse(out.slice(out.indexOf("{")));
  containerRunning =
    execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", "supabase_db_orderpilot"], {
      encoding: "utf8",
      env,
    }).trim() === "true";
} catch {
  // Reported below as problems.
}

const problems = localTargetProblems({
  projectId,
  linkedProjectRef,
  apiUrl: status.API_URL,
  dbUrl: status.DB_URL,
  env: process.env,
  containerRunning,
});
if (problems.length > 0) {
  console.error(
    "Refusing to touch the database. It is not verified as OrderPilot's local development database:",
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.error("Verified: OrderPilot local development database.");
