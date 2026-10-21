// @ts-expect-error -- plain ESM helper without type declarations
import { localTargetProblems } from "../../scripts/dev/local-target.mjs";

const local = {
  projectId: "orderpilot",
  linkedProjectRef: null,
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  env: {},
  containerRunning: true,
};

describe("local database target guard", () => {
  it("accepts the verified local stack", () => {
    expect(localTargetProblems(local)).toEqual([]);
  });

  it.each([
    [{ projectId: "other" }, /project_id/],
    [{ linkedProjectRef: "abcdefghijkl" }, /linked to a Supabase cloud project/],
    [{ apiUrl: "https://abcdefghijkl.supabase.co" }, /API URL is not local/],
    [
      { dbUrl: "postgresql://u:p@db.abcdefghijkl.supabase.co:5432/postgres" },
      /database URL is not local/,
    ],
    [{ dbUrl: undefined }, /database URL is not local \(missing\)/],
    [{ env: { SUPABASE_DB_URL: "postgresql://u:p@prod.example.com/db" } }, /SUPABASE_DB_URL/],
    [{ env: { DATABASE_URL: "postgres://staging.example.com/db" } }, /DATABASE_URL/],
    [{ env: { PGHOST: "staging.example.com" } }, /PGHOST/],
    [{ containerRunning: false }, /not running/],
  ])("refuses %j", (override, message) => {
    const problems = localTargetProblems({ ...local, ...override });
    expect(problems.join("\n")).toMatch(message);
  });
});
