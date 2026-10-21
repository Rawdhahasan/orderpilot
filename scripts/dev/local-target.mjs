// Pure checks that a database command targets OrderPilot's LOCAL stack only.
// Used by scripts/dev/assert-local-db.mjs and unit-tested.

export const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];
const URL_VARIABLES = [
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
];

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns a list of problems; empty means the target is verified local.
 * @param {{ projectId?: string, linkedProjectRef?: string | null, apiUrl?: string, dbUrl?: string,
 *           env?: Record<string, string | undefined>, containerRunning?: boolean }} target
 */
export function localTargetProblems(target) {
  const problems = [];
  if (target.projectId !== "orderpilot")
    problems.push(
      `supabase/config.toml project_id is "${target.projectId}", expected "orderpilot"`,
    );
  if (target.linkedProjectRef)
    problems.push(
      "this checkout is linked to a Supabase cloud project (supabase/.temp/project-ref); unlink it first",
    );
  for (const [label, value] of [
    ["API URL", target.apiUrl],
    ["database URL", target.dbUrl],
  ]) {
    const host = value ? hostOf(value) : null;
    if (!host || !LOCAL_HOSTS.includes(host))
      problems.push(`the ${label} is not local (${host ?? "missing"})`);
  }
  for (const name of URL_VARIABLES) {
    const value = target.env?.[name];
    if (!value) continue;
    const host = hostOf(value);
    if (!host || !LOCAL_HOSTS.includes(host))
      problems.push(`${name} points at a non-local host (${host ?? "unparseable"})`);
  }
  if (target.env?.PGHOST && !LOCAL_HOSTS.includes(target.env.PGHOST))
    problems.push(`PGHOST is not local (${target.env.PGHOST})`);
  if (!target.containerRunning)
    problems.push("the local database container supabase_db_orderpilot is not running");
  return problems;
}
