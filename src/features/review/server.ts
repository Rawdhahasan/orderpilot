import "server-only";

import { createHash } from "node:crypto";

import { validate, type FieldMeta, type ValidationInput } from "@/domain/orders/validation";
import type { Json } from "@/server/db/database.types";
import type { createClient } from "@/server/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const norm = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
/** Plain JSON for RPC arguments (drops undefined values). */
export const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json;
const str = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

export type ReviewSnapshot = NonNullable<Awaited<ReturnType<typeof loadReview>>>;

/** Everything the review and approval screens need, in a handful of queries. */
export async function loadReview(supabase: Supabase, intakeId: string) {
  const { data: intake } = await supabase
    .from("inbound_orders")
    .select(
      `id, organization_id, reference, status, version, validated_version, manual_entry, customer_id, customer_hint_id,
       customer_po_number, po_date, requested_delivery_date, currency, payment_terms, document_total, document_tax_total,
       bill_to, ship_to, bill_to_address_id, ship_to_address_id, notes, field_meta, latest_extraction_run_id,
       submitted_by, submitted_at, submit_note, decided_by, decided_at, decision_reason, cancel_reason, cancel_note,
       sales_order_id, assigned_to, updated_at, created_at, source_document_id,
       customer:customers!inbound_orders_organization_id_customer_id_fkey(id, name, status, hold_reason, account_number),
       document:source_documents(id, original_filename, mime_type, page_count),
       assignee:profiles!inbound_orders_assigned_to_fkey(full_name),
       submitter:profiles!inbound_orders_submitted_by_fkey(full_name),
       decider:profiles!inbound_orders_decided_by_fkey(full_name),
       editor:profiles!inbound_orders_updated_by_fkey(full_name)`,
    )
    .eq("id", intakeId)
    .maybeSingle();
  if (!intake) return null;

  const [{ data: lines }, { data: exceptions }, { data: org }, { data: run }] = await Promise.all([
    supabase
      .from("inbound_order_lines")
      .select(
        `id, line_no, page_number, customer_part_number, description, po_quantity, po_uom, po_unit_price, po_line_total,
         product_id, match_method, match_score, remember_alias, quantity, uom_conversion_note, unit_price, price_source,
         expected_unit_price, field_meta, removed_at, removed_reason,
         product:products(id, sku, name, status, selling_uom, quantity_decimals, track_inventory)`,
      )
      .eq("inbound_order_id", intakeId)
      .order("line_no"),
    supabase
      .from("order_exceptions")
      .select(
        `id, inbound_order_line_id, code, severity, overridable, status, message, details, fingerprint, resolution_note,
         override_reason, override_conflicts, overridden_at, resolved_at,
         overrider:profiles!order_exceptions_overridden_by_fkey(full_name), resolver:profiles!order_exceptions_resolved_by_fkey(full_name)`,
      )
      .eq("inbound_order_id", intakeId)
      .order("created_at"),
    supabase
      .from("organizations")
      .select(
        "base_currency, price_tolerance_pct, confidence_threshold, require_independent_approval, timezone",
      )
      .eq("id", intake.organization_id)
      .single(),
    intake.latest_extraction_run_id
      ? supabase
          .from("extraction_runs")
          .select(
            "id, status, attempt, max_attempts, error_code, error_message, provider, provider_version, overall_confidence, raw_output, available_at",
          )
          .eq("id", intake.latest_extraction_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const productIds = [
    ...new Set((lines ?? []).map((l) => l.product_id).filter((id): id is string => Boolean(id))),
  ];
  const [{ data: stock }, { data: prices }, { data: dup }, { data: addresses }] = await Promise.all(
    [
      productIds.length
        ? supabase.from("stock_levels").select("product_id, available").in("product_id", productIds)
        : Promise.resolve({
            data: [] as { product_id: string | null; available: number | null }[],
          }),
      supabase.rpc("expected_prices", { p_inbound_order_id: intakeId }),
      supabase.rpc("intake_duplicate_info", { p_inbound_order_id: intakeId }),
      intake.customer_id
        ? supabase
            .from("customer_addresses")
            .select(
              "id, type, label, line1, line2, line3, city, region, postal_code, country_code, is_default",
            )
            .eq("customer_id", intake.customer_id)
            .eq("status", "active")
        : Promise.resolve({ data: [] as never[] }),
    ],
  );

  return {
    intake,
    lines: lines ?? [],
    exceptions: exceptions ?? [],
    org: org!,
    run,
    stock: new Map((stock ?? []).map((s) => [s.product_id!, str(s.available)])),
    expected: new Map(
      (prices ?? []).map((p) => [p.line_id, { price: String(p.unit_price), source: p.source }]),
    ),
    duplicates: (dup ?? {}) as {
      po_conflicts: unknown[];
      po_fingerprint: string;
      document_conflicts: unknown[];
      document_fingerprint: string;
      possible_duplicates: string[];
    },
    addresses: addresses ?? [],
  };
}

export function validationInput(s: ReviewSnapshot, today: string): ValidationInput {
  const shipTo = s.intake.ship_to as Record<string, unknown> | null;
  const shipKey = shipTo ? `${norm(shipTo.line1)}|${norm(shipTo.postal_code)}` : null;
  const customer = s.intake.customer as { status: "active" | "on_hold" | "inactive" } | null;
  return {
    today,
    workspace: {
      baseCurrency: s.org.base_currency,
      priceTolerancePct: Number(s.org.price_tolerance_pct),
    },
    intake: {
      customerId: s.intake.customer_id,
      customerStatus: customer?.status ?? null,
      poNumber: s.intake.customer_po_number,
      requestedDeliveryDate: s.intake.requested_delivery_date,
      currency: s.intake.currency,
      hasShipTo: Boolean(shipTo),
      shipToAddressId: s.intake.ship_to_address_id,
      shipToOnFile: Boolean(
        shipKey &&
        s.addresses.some(
          (a) => a.type === "shipping" && `${norm(a.line1)}|${norm(a.postal_code)}` === shipKey,
        ),
      ),
      documentTotal: str(s.intake.document_total),
      fieldMeta: (s.intake.field_meta ?? {}) as Record<string, FieldMeta>,
    },
    duplicates: {
      poConflicts: s.duplicates.po_conflicts ?? [],
      poFingerprint: s.duplicates.po_fingerprint ?? "",
      documentConflicts: s.duplicates.document_conflicts ?? [],
      documentFingerprint: s.duplicates.document_fingerprint ?? "",
      possibleDuplicates: s.duplicates.possible_duplicates ?? [],
    },
    lines: s.lines
      .filter((l) => !l.removed_at)
      .map((l) => {
        const product = l.product as {
          status: "active" | "discontinued";
          selling_uom: string;
          quantity_decimals: number;
          track_inventory: boolean;
        } | null;
        return {
          id: l.id,
          lineNo: l.line_no,
          productId: l.product_id,
          productStatus: product?.status ?? null,
          sellingUom: product?.selling_uom ?? null,
          quantityDecimals: product?.quantity_decimals ?? 3,
          poUom: l.po_uom,
          uomConversionNote: l.uom_conversion_note,
          quantity: str(l.quantity),
          unitPrice: str(l.unit_price),
          poUnitPrice: str(l.po_unit_price),
          expectedPrice: s.expected.get(l.id)?.price ?? null,
          available:
            product?.track_inventory && l.product_id ? (s.stock.get(l.product_id) ?? "0") : null,
          fieldMeta: (l.field_meta ?? {}) as Record<string, FieldMeta>,
        };
      }),
  };
}

/** Runs the rules on the saved version and stores the result (FR-REV-07). */
export async function revalidate(supabase: Supabase, intakeId: string) {
  const snapshot = await loadReview(supabase, intakeId);
  if (!snapshot || !["in_review", "pending_approval"].includes(snapshot.intake.status))
    return snapshot;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: snapshot.org.timezone });
  const exceptions = validate(validationInput(snapshot, today), hash);
  const { error } = await supabase.rpc("record_validation", {
    p_inbound_order_id: intakeId,
    p_version: snapshot.intake.version,
    p_exceptions: toJson(exceptions),
  });
  if (error) throw error;
  return loadReview(supabase, intakeId);
}

/**
 * First open after extraction (or manual entry): suggest the customer and the
 * products, and apply the expected price where the PO shows none (D-15).
 * Suggestions are never confirmed automatically.
 */
export async function prepareDraft(supabase: Supabase, intakeId: string) {
  try {
    await prepareDraftOnce(supabase, intakeId);
  } catch (error) {
    // Another request (a second tab, a refresh) prepared it at the same time.
    if ((error as { message?: string }).message?.startsWith("stale_version")) return;
    throw error;
  }
}

async function prepareDraftOnce(supabase: Supabase, intakeId: string) {
  const snapshot = await loadReview(supabase, intakeId);
  if (
    !snapshot ||
    snapshot.intake.status !== "in_review" ||
    snapshot.intake.validated_version !== null
  )
    return;
  const header: Record<string, unknown> = {};
  const meta = { ...((snapshot.intake.field_meta ?? {}) as Record<string, FieldMeta>) };
  const raw = (snapshot.run?.raw_output ?? null) as {
    header?: Record<string, { value?: unknown; confidence?: number }>;
  } | null;

  let customerId = snapshot.intake.customer_id;
  if (!customerId && raw?.header) {
    const { data: candidates } = await supabase.rpc("match_customers", {
      p_organization_id: snapshot.intake.organization_id,
      p_name: String(raw.header.customer_name?.value ?? ""),
      p_account: raw.header.account_number?.value
        ? String(raw.header.account_number.value)
        : undefined,
    });
    const top = candidates?.[0];
    if (top && top.score >= 0.5) {
      customerId = top.customer_id;
      header.customer_id = top.customer_id;
      meta.customer_id = {
        source: "ai",
        state: "suggested",
        method: top.method,
        confidence: Math.min(1, top.score),
      };
    }
  }

  const lines: Record<string, unknown>[] = [];
  if (customerId) {
    const unmatched = snapshot.lines.filter((l) => !l.removed_at && !l.product_id);
    if (unmatched.length) {
      const { data: matches } = await supabase.rpc("match_products", {
        p_organization_id: snapshot.intake.organization_id,
        p_customer_id: customerId,
        p_lines: unmatched.map((l) => ({
          key: l.id,
          part: l.customer_part_number,
          description: l.description,
        })),
      });
      for (const l of unmatched) {
        const best = (matches ?? []).find((m) => m.line_key === l.id);
        if (best && best.score >= 0.5) {
          lines.push({
            id: l.id,
            product_id: best.product_id,
            match_method: best.method,
            match_score: Math.min(1, Math.round(best.score * 1000) / 1000),
            field_meta: {
              ...((l.field_meta ?? {}) as object),
              product_id: {
                source: "ai",
                state: "suggested",
                method: best.method,
                confidence: Math.min(1, best.score),
              },
            },
          });
        }
      }
    }
  }
  if (Object.keys(header).length || lines.length) {
    header.field_meta = meta;
    const { error } = await supabase.rpc("save_inbound_order_draft", {
      p_inbound_order_id: intakeId,
      p_expected_version: snapshot.intake.version,
      p_header: toJson(header),
      p_lines: toJson(lines),
    });
    if (error) throw error;
  }
  await applyExpectedPrices(supabase, intakeId);
  await revalidate(supabase, intakeId);
}

/** Lines with a product but no PO price take the expected price, labelled with its source (D-15). */
export async function applyExpectedPrices(supabase: Supabase, intakeId: string) {
  const snapshot = await loadReview(supabase, intakeId);
  if (!snapshot || snapshot.intake.status !== "in_review") return;
  const updates = snapshot.lines
    .filter(
      (l) =>
        !l.removed_at && l.product_id && l.po_unit_price === null && snapshot.expected.has(l.id),
    )
    .filter(
      (l) =>
        String(l.unit_price ?? "") !== snapshot.expected.get(l.id)!.price ||
        l.price_source !== snapshot.expected.get(l.id)!.source,
    )
    .map((l) => {
      const expected = snapshot.expected.get(l.id)!;
      return {
        id: l.id,
        unit_price: expected.price,
        price_source: expected.source,
        expected_unit_price: expected.price,
        field_meta: {
          ...((l.field_meta ?? {}) as object),
          unit_price: {
            source: "system_default",
            state: "system_default",
            label: expected.source === "customer_price" ? "Customer price" : "List price",
          },
        },
      };
    });
  if (!updates.length) return;
  const { error } = await supabase.rpc("save_inbound_order_draft", {
    p_inbound_order_id: intakeId,
    p_expected_version: snapshot.intake.version,
    p_header: {},
    p_lines: toJson(updates),
  });
  if (error) throw error;
}
