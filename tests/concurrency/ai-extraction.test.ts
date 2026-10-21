// The extraction worker with the Gemini provider, against the LOCAL database
// and a mock Gemini server on localhost. No request ever reaches Google.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { serviceClient, sql, USERS } from "./support";

const ORG = "00000000-0000-4000-a000-000000000001";
type Reply = { status: number; body: unknown };
/** Mock replies per document, so leftover jobs from other runs never take them. */
const replies = new Map<string, Reply[]>();
const reply = (doc: string, r: Reply) => replies.set(doc, [...(replies.get(doc) ?? []), r]);
let calls = 0;
let server: Server;

const f = (raw: string | null, page: number | null = 1, uncertain = false) => ({
  raw,
  page,
  uncertain,
});
const noAddress = {
  ...f(null, null),
  name: null,
  line1: null,
  line2: null,
  city: null,
  region: null,
  postal_code: null,
  country_code: null,
};
const purchaseOrder = (po: string) => ({
  status: "complete",
  warnings: [],
  customer_name: f("Quillfeather Labs (fictional)"),
  customer_account_number: f(null, null),
  customer_address: noAddress,
  ship_to: noAddress,
  po_number: f(po),
  order_date: f("2026-10-01", 1, true),
  requested_delivery_date: f(null, null),
  currency: f("USD"),
  payment_terms: f(null, null),
  notes: f(null, null),
  order_total: f("99.00", 2),
  lines: [
    {
      page: 2,
      customer_product_code: f("ZZ-NOT-IN-CATALOGUE", 2),
      description: f("A product nobody sells", 2),
      quantity: f("3", 2, true),
      unit_of_measure: f("EA", 2),
      unit_price: f("33.00", 2),
      line_total: f("99.00", 2),
    },
  ],
});
const ok = (payload: unknown): Reply => ({
  status: 200,
  body: {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 200, totalTokenCount: 1100 },
  },
});
const fail = (status: number, message: string): Reply => ({
  status,
  body: {
    error: { code: status, message, status: status === 429 ? "RESOURCE_EXHAUSTED" : "ERROR" },
  },
});

/** A stored fictional PDF and an intake queued for Gemini extraction. */
async function queuedIntake(): Promise<{ intake: string; doc: string }> {
  const doc = randomUUID();
  const intake = randomUUID();
  sql(`
    insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
    values ('${doc}', '${ORG}', 'fictional-po.pdf', 'application/pdf', 40, 2, encode(sha256(convert_to('${doc}', 'UTF8')), 'hex'), 'stored', '${USERS.processor.id}', now());
    insert into public.inbound_orders (id, organization_id, reference, source_document_id)
    values ('${intake}', '${ORG}', 'IN-' || lpad((floor(random() * 1e9))::text, 9, '0'), '${doc}');`);
  const admin = serviceClient();
  const upload = await admin.storage
    .from("source-documents")
    .upload(`${ORG}/${doc}`, new TextEncoder().encode(`%PDF-1.4 fictional test document ${doc}`), {
      contentType: "application/pdf",
    });
  if (upload.error) throw new Error(upload.error.message);
  const started = await admin.rpc("start_extraction", {
    p_inbound_order_id: intake,
    p_provider: "gemini",
  });
  if (started.error) throw new Error(started.error.message);
  return { intake, doc };
}

const state = (intake: string) =>
  sql(`select i.status || '|' || r.status || '|' || r.attempt || '|' || coalesce(r.error_code, '-')
         from public.inbound_orders i join public.extraction_runs r on r.id = i.latest_extraction_run_id
        where i.id = '${intake}'`);
const dueNow = (intake: string) =>
  sql(`update public.extraction_runs set available_at = now()
        where inbound_order_id = '${intake}' and status = 'queued'`);
const usage = (intake: string) =>
  sql(`select string_agg(u.outcome || ':' || coalesce(u.error_code, '-') || ':' || coalesce(u.total_tokens::text, '-'), ',' order by u.id)
         from public.ai_usage_events u join public.extraction_runs r on r.id = u.extraction_run_id
        where r.inbound_order_id = '${intake}'`);

/** The worker module with the given AI settings (fresh module: the environment is read once). */
const BASE: Record<string, string> = {
  AI_EXTRACTION_PROVIDER: "gemini",
  GEMINI_API_KEY: "mock-key-not-real",
  GEMINI_MODEL: "gemini-mock",
  AI_REQUEST_TIMEOUT_MS: "5000",
  AI_MAX_PAGES: "15",
  AI_MAX_REQUESTS_PER_MINUTE: "1000",
  AI_MAX_REQUESTS_PER_DAY: "100000",
  AI_MAX_REQUESTS_PER_WORKSPACE_PER_DAY: "100000",
};
async function worker(settings: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...BASE, ...settings })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return (await import("@/server/extraction/worker")).processDueJobs;
}
const run = async (settings?: Record<string, string | undefined>) =>
  (await worker(settings))({ maxJobs: 50, budgetMs: 30_000 });

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      calls += 1;
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const pdf = Buffer.from(body.contents[0].parts[1].inlineData.data, "base64").toString("utf8");
      const doc = pdf.split(" ").pop()!;
      const reply = replies.get(doc)?.shift() ?? fail(500, "no reply prepared");
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const text = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  for (const line of text.split("\n"))
    if (/^[A-Z0-9_]+=/.test(line))
      process.env[line.slice(0, line.indexOf("="))] = line.slice(line.indexOf("=") + 1);
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  // Older queued work is not part of these tests.
  sql(`select public.recover_stale_extractions()`);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("Gemini extraction through the worker (mock API)", () => {
  it("values become suggestions for review; nothing is approved, matched or reserved", async () => {
    const { intake, doc } = await queuedIntake();
    const po = `GM-${randomUUID().slice(0, 8)}`;
    reply(doc, ok(purchaseOrder(po)));
    await run();
    expect(state(intake)).toBe("in_review|succeeded|1|-");
    expect(
      sql(`select customer_po_number || '|' || (field_meta -> 'customer_po_number' ->> 'state') || '|' ||
                  (field_meta -> 'customer_po_number' ->> 'source') || '|' || coalesce(field_meta -> 'customer_po_number' ->> 'confidence', 'none')
             from public.inbound_orders where id = '${intake}'`),
    ).toBe(`${po}|suggested|ai|none`);
    expect(
      sql(`select coalesce(product_id::text, 'no product') || '|' || quantity || '|' || (field_meta -> 'quantity' ->> 'uncertain') || '|' || page_number
             from public.inbound_order_lines where inbound_order_id = '${intake}'`),
    ).toBe("no product|3.000|true|2");
    expect(
      sql(`select count(*) from public.sales_orders where inbound_order_id = '${intake}'`),
    ).toBe("0");
    expect(
      sql(`select provider || '|' || provider_version from public.extraction_runs r
             join public.inbound_orders i on i.latest_extraction_run_id = r.id where i.id = '${intake}'`),
    ).toBe("gemini|gemini-mock");
    expect(usage(intake)).toBe("succeeded:-:1100");
  });

  it("a provider outage is retried with backoff, then succeeds", async () => {
    const { intake, doc } = await queuedIntake();
    reply(doc, fail(503, "The model is overloaded."));
    await run();
    expect(state(intake)).toBe("extracting|queued|2|-");
    reply(doc, ok(purchaseOrder(`GM-${randomUUID().slice(0, 8)}`)));
    dueNow(intake);
    await run();
    expect(state(intake)).toBe("in_review|succeeded|2|-");
    expect(usage(intake)).toBe("failed:ai_provider_error:-,succeeded:-:1100");
  });

  it("invalid AI answers are retried and then fail to manual entry; nothing is applied", async () => {
    const { intake, doc } = await queuedIntake();
    for (let attempt = 0; attempt < 3; attempt++) {
      reply(doc, ok({ status: "complete", lines: "not a list" }));
      dueNow(intake);
      await run();
    }
    expect(state(intake)).toBe("extraction_failed|failed|3|ai_invalid_response");
    expect(
      sql(`select count(*) from public.inbound_order_lines where inbound_order_id = '${intake}'`),
    ).toBe("0");
  });

  it("an exhausted daily Gemini quota fails at once with a clear message (no paid fallback)", async () => {
    const { intake, doc } = await queuedIntake();
    reply(
      doc,
      fail(429, "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier"),
    );
    await run();
    expect(state(intake)).toBe("extraction_failed|failed|1|ai_quota_exhausted");
    expect(
      sql(
        `select r.error_message from public.extraction_runs r join public.inbound_orders i on i.latest_extraction_run_id = r.id where i.id = '${intake}'`,
      ),
    ).toMatch(/quota/i);
  });

  it("a per-minute rate limit from Gemini is retried later", async () => {
    const { intake, doc } = await queuedIntake();
    reply(doc, fail(429, "Resource has been exhausted. Requests per minute exceeded."));
    await run();
    expect(state(intake)).toBe("extracting|queued|2|-");
    expect(usage(intake)).toBe("failed:ai_rate_limited:-");
  });

  it("the workspace's own daily limit stops calls before they reach Gemini", async () => {
    const { intake } = await queuedIntake();
    const used = sql(
      `select count(*) from public.ai_usage_events where organization_id = '${ORG}' and created_at > now() - interval '24 hours'`,
    );
    const before = calls;
    await run({ AI_MAX_REQUESTS_PER_WORKSPACE_PER_DAY: used });
    expect(calls).toBe(before);
    expect(state(intake)).toBe("extraction_failed|failed|1|ai_quota_exhausted");
    expect(
      sql(
        `select r.error_message from public.extraction_runs r join public.inbound_orders i on i.latest_extraction_run_id = r.id where i.id = '${intake}'`,
      ),
    ).toMatch(/workspace has reached today's AI extraction limit/);
  });

  it("when this minute's budget is spent, jobs stay queued untouched", async () => {
    const { intake, doc } = await queuedIntake();
    const before = calls;
    // Earlier tests made calls within the last minute; make that the limit.
    const lastMinute = sql(
      `select count(*) from public.ai_usage_events where created_at > now() - interval '1 minute'`,
    );
    expect(Number(lastMinute)).toBeGreaterThan(0);
    const { processed } = await run({ AI_MAX_REQUESTS_PER_MINUTE: lastMinute });
    expect(processed).toBe(0);
    expect(calls).toBe(before);
    expect(state(intake)).toBe("extracting|queued|1|-");
    sql(`select public.recover_stale_extractions()`);
    reply(doc, ok(purchaseOrder(`GM-${randomUUID().slice(0, 8)}`)));
    await run();
    expect(state(intake)).toBe("in_review|succeeded|1|-");
  });

  it("documents over the AI page limit go to manual entry without a call", async () => {
    const { intake } = await queuedIntake();
    const before = calls;
    await run({ AI_MAX_PAGES: "1" });
    expect(calls).toBe(before);
    expect(state(intake)).toBe("extraction_failed|failed|1|ai_document_too_large");
  });

  it("a job whose worker crashed is recovered and completed", async () => {
    const { intake, doc } = await queuedIntake();
    const claim = await serviceClient().rpc("claim_extraction_job", { p_lease_seconds: 60 });
    expect(claim.error).toBeNull();
    // The worker dies holding the lease; the lease expires.
    sql(`update public.extraction_runs set lease_expires_at = now() - interval '1 second'
          where inbound_order_id = '${intake}' and status = 'running'`);
    reply(doc, ok(purchaseOrder(`GM-${randomUUID().slice(0, 8)}`)));
    await run();
    sql(
      `update public.extraction_runs set available_at = now() where inbound_order_id = '${intake}' and status = 'queued'`,
    );
    await run();
    expect(state(intake)).toMatch(/^in_review\|succeeded\|2\|/);
  });

  it("without an API key Gemini jobs fail to manual entry; there is no switch to another provider", async () => {
    const { intake } = await queuedIntake();
    const before = calls;
    await run({ GEMINI_API_KEY: undefined });
    expect(calls).toBe(before);
    expect(state(intake)).toBe("extraction_failed|failed|1|ai_not_configured");
  });
});
