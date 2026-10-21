// Runs the reference-dataset performance check against the LOCAL database only.
// The dataset is created inside one transaction and rolled back.
//   corepack pnpm perf:check
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

execFileSync("node", [new URL("./assert-local-db.mjs", import.meta.url).pathname], {
  stdio: "inherit",
});
const sql = readFileSync(new URL("./perf/reference-dataset.sql", import.meta.url), "utf8");
const out = execFileSync(
  "docker",
  ["exec", "-i", "supabase_db_orderpilot", "psql", "-U", "postgres", "-d", "postgres", "-q"],
  {
    input: sql,
    encoding: "utf8",
    env: { ...process.env, PATH: `${process.env.HOME}/.docker/bin:${process.env.PATH}` },
    maxBuffer: 10 * 1024 * 1024,
  },
);
for (const line of out.split("\n")) {
  if (
    /^---|Execution Time|Time:|approved|expected_prices|integrity_violations|^\s+(true|false|t|f|\d+)\s*$/.test(
      line,
    )
  )
    console.log(line);
}
