import { expect } from "@playwright/test";

import { localSql, test } from "./app/support";

// Runs after the journeys that change stock (Phase 5 exit criterion).
test("inventory invariants hold after every journey in this run", () => {
  expect(localSql("select count(*) from private.inventory_integrity_report()")).toBe("0");
});
