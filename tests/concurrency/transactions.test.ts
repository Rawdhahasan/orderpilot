import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  balance,
  integrityViolations,
  pendingIntake,
  serviceClient,
  signedInClients,
  sql,
  stockedProduct,
  uniquePo,
} from "./support";

type Result = { data: unknown; error: { message: string } | null };

let approver: SupabaseClient;
let inventory: SupabaseClient;
let approvers: SupabaseClient[];

beforeAll(async () => {
  // Several independent sessions so requests really run side by side.
  const clients = await signedInClients(["approver", "inventory"], 4);
  approvers = clients.approver;
  approver = approvers[0]!;
  inventory = clients.inventory[0]!;
});

const approve = (
  client: SupabaseClient,
  intakeId: string,
  decisions: Record<string, string> = {},
) =>
  client.rpc("approve_inbound_order", {
    p_inbound_order_id: intakeId,
    p_expected_version: 1,
    p_stock_decisions: decisions,
  }) as unknown as Promise<Result>;

describe("concurrent approval", () => {
  it("ten simultaneous approvals of one order create exactly one sales order", async () => {
    const product = stockedProduct(100);
    const intake = pendingIntake(uniquePo(), [{ productId: product, qty: 5 }]);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => approve(approvers[i % approvers.length]!, intake.id)),
    );

    expect(results.map((r) => r.error?.message ?? null).filter(Boolean)).toEqual([]);
    const ids = new Set(results.map((r) => (r.data as { sales_order_id: string }).sales_order_id));
    expect(ids.size).toBe(1);
    expect(
      results.filter((r) => (r.data as { already_approved: boolean }).already_approved === false),
    ).toHaveLength(1);
    expect(
      sql(`select count(*) from public.sales_orders where inbound_order_id = '${intake.id}'`),
    ).toBe("1");
    expect(balance(product)).toEqual({ onHand: 100, reserved: 5 });
  });

  it("two overridden orders with the same PO number approved at once: the second sees the first and is refused", async () => {
    const product = stockedProduct(100);
    const po = uniquePo();
    const a = pendingIntake(po, [{ productId: product, qty: 1 }]);
    const b = pendingIntake(po.toLowerCase().replace("-", " "), [{ productId: product, qty: 1 }]);
    // Each was overridden after reviewing the other (pending) intake. Without
    // the per-PO-number lock both would pass: authorised duplicates are exempt
    // from the unique index (§12.1 #4).
    for (const intake of [a, b]) {
      sql(`
        insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
          override_reason, overridden_by, overridden_at, override_fingerprint, override_conflicts)
        select i.organization_id, i.id, 'DUPLICATE_PO_NUMBER', 'blocking', true, 'overridden', 'Duplicate PO', repeat('a', 64),
               'Reviewed in concurrency test', '00000000-0000-4000-a500-000000000003', now(),
               private.conflict_fingerprint(private.po_conflicts(i)), private.po_conflicts(i)
          from public.inbound_orders i where i.id = '${intake.id}'`);
    }
    const [ra, rb] = await Promise.all([
      approve(approvers[0]!, a.id),
      approve(approvers[1]!, b.id),
    ]);

    const results = [ra!, rb!];
    expect(results.map((r) => r.error?.message ?? null).filter(Boolean)).toEqual([]);
    const ok = results.filter((r) => (r.data as { ok: boolean }).ok);
    expect(ok).toHaveLength(1);
    const refused = results.find((r) => !(r.data as { ok: boolean }).ok)!.data as {
      code: string;
      reopened_overrides: number;
    };
    expect(refused.code).toBe("gate_failed");
    expect(refused.reopened_overrides).toBe(1);
    expect(
      sql(
        `select count(*) from public.sales_orders where inbound_order_id in ('${a.id}', '${b.id}')`,
      ),
    ).toBe("1");
  });

  it("negative control: without the PO-number lock, both overridden duplicates would be confirmed", async () => {
    const original = sql(
      `select pg_get_functiondef('private.lock_po_number(uuid, uuid, text)'::regprocedure)`,
    );
    // Replace the lock with a short pause so both approvals overlap.
    sql(`create or replace function private.lock_po_number(p_organization_id uuid, p_customer_id uuid, p_po_normalized text)
         returns void language plpgsql set search_path = '' as $f$ begin perform pg_sleep(0.5); end $f$`);
    try {
      const product = stockedProduct(100);
      const po = uniquePo();
      const a = pendingIntake(po, [{ productId: product, qty: 1 }]);
      const b = pendingIntake(po.toLowerCase().replace("-", " "), [{ productId: product, qty: 1 }]);
      for (const intake of [a, b]) {
        sql(`
          insert into public.order_exceptions (organization_id, inbound_order_id, code, severity, overridable, status, message, fingerprint,
            override_reason, overridden_by, overridden_at, override_fingerprint, override_conflicts)
          select i.organization_id, i.id, 'DUPLICATE_PO_NUMBER', 'blocking', true, 'overridden', 'Duplicate PO', repeat('a', 64),
                 'Negative control', '00000000-0000-4000-a500-000000000003', now(),
                 private.conflict_fingerprint(private.po_conflicts(i)), private.po_conflicts(i)
            from public.inbound_orders i where i.id = '${intake.id}'`);
      }
      await Promise.all([approve(approvers[0]!, a.id), approve(approvers[1]!, b.id)]);
      expect(
        sql(
          `select count(*) from public.sales_orders where inbound_order_id in ('${a.id}', '${b.id}')`,
        ),
      ).toBe("2");
    } finally {
      sql(original);
    }
    expect(
      sql(
        `select prosrc like '%pg_advisory_xact_lock%' from pg_proc where oid = 'private.lock_po_number(uuid, uuid, text)'::regprocedure`,
      ),
    ).toBe("t");
  });

  it("concurrent approvals never reserve the same stock twice", async () => {
    const product = stockedProduct(10);
    const intakes = Array.from({ length: 8 }, () =>
      pendingIntake(uniquePo(), [{ productId: product, qty: 3 }]),
    );
    const results = await Promise.all(
      intakes.map((intake, i) =>
        approve(approvers[i % approvers.length]!, intake.id, { [intake.lineIds[0]!]: "backorder" }),
      ),
    );
    expect(results.map((r) => r.error?.message ?? null).filter(Boolean)).toEqual([]);
    expect(results.every((r) => (r.data as { ok: boolean }).ok)).toBe(true);

    const allocated = Number(
      sql(
        `select sum(l.allocated_qty) from public.sales_order_lines l where l.product_id = '${product}'`,
      ),
    );
    const backordered = Number(
      sql(
        `select sum(l.backordered_qty) from public.sales_order_lines l where l.product_id = '${product}'`,
      ),
    );
    expect(allocated).toBe(10);
    expect(backordered).toBe(14);
    expect(balance(product)).toEqual({ onHand: 10, reserved: 10 });
  });
});

describe("concurrent fulfilment and cancellation", () => {
  it("a sales order is either fulfilled or cancelled, never both", async () => {
    const product = stockedProduct(20);
    const intake = pendingIntake(uniquePo(), [{ productId: product, qty: 4 }]);
    const approved = (await approve(approver, intake.id)).data as { sales_order_id: string };
    const so = approved.sales_order_id;

    const [fulfil, cancel] = (await Promise.all([
      inventory.rpc("fulfill_sales_order", { p_sales_order_id: so, p_expected_version: 1 }),
      approvers[1]!.rpc("cancel_sales_order", {
        p_sales_order_id: so,
        p_expected_version: 1,
        p_reason: "Concurrency test",
      }),
    ])) as unknown as Result[];
    expect([fulfil!.error, cancel!.error].filter((e) => e === null)).toHaveLength(1);
    const status = sql(`select status from public.sales_orders where id = '${so}'`);
    expect(["fulfilled", "cancelled"]).toContain(status);
    expect(balance(product)).toEqual(
      status === "fulfilled" ? { onHand: 16, reserved: 0 } : { onHand: 20, reserved: 0 },
    );
  });

  it("repeated simultaneous fulfilment issues stock once", async () => {
    const product = stockedProduct(20);
    const intake = pendingIntake(uniquePo(), [{ productId: product, qty: 6 }]);
    const so = ((await approve(approver, intake.id)).data as { sales_order_id: string })
      .sales_order_id;
    const results = (await Promise.all(
      Array.from({ length: 5 }, () =>
        inventory.rpc("fulfill_sales_order", { p_sales_order_id: so, p_expected_version: 1 }),
      ),
    )) as unknown as Result[];
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(balance(product)).toEqual({ onHand: 14, reserved: 0 });
  });
});

describe("concurrent extraction workers", () => {
  it("workers racing for jobs never claim the same job twice", async () => {
    const worker = serviceClient();
    // Close any older queued work so this test sees only its own jobs.
    sql(`select public.recover_stale_extractions()`);
    const intakes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = sql(`
        with d as (
          insert into public.source_documents (organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
          values ('00000000-0000-4000-a000-000000000001', 'q.pdf', 'application/pdf', 10, 1, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 'stored', '00000000-0000-4000-a500-000000000004', now())
          returning id)
        insert into public.inbound_orders (organization_id, reference, source_document_id)
        select '00000000-0000-4000-a000-000000000001', 'IN-' || lpad((floor(random() * 1e9))::text, 9, '0'), id from d
        returning id`);
      await worker.rpc("start_extraction", { p_inbound_order_id: id.split("\n")[0] });
      intakes.push(id.split("\n")[0]!);
    }
    const claims = (await Promise.all(
      Array.from({ length: 20 }, () => worker.rpc("claim_extraction_job", { p_lease_seconds: 60 })),
    )) as unknown as {
      data: { run_id: string; inbound_order_id: string }[] | null;
      error: unknown;
    }[];
    expect(claims.every((c) => c.error === null)).toBe(true);
    const claimed = claims
      .flatMap((c) => c.data ?? [])
      .filter((c) => intakes.includes(c.inbound_order_id));
    expect(claimed).toHaveLength(5);
    expect(new Set(claimed.map((c) => c.run_id)).size).toBe(5);
  });
});

describe("integrity", () => {
  it("the inventory integrity report is empty after the concurrent runs", () => {
    expect(integrityViolations()).toBe("");
  });
});
