import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/server/env";
import { processDueJobs } from "@/server/extraction/worker";

/**
 * Internal worker route (TECHNICAL_ARCHITECTURE.md §8). Called by after()
 * triggers and, in deployed environments, by a scheduler. Authenticated with
 * INTERNAL_JOB_SECRET; the queue in Postgres stays the source of truth.
 */
export async function POST(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${serverEnv().INTERNAL_JOB_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const result = await processDueJobs({ maxJobs: 10, budgetMs: 25_000 });
  return NextResponse.json(result);
}
