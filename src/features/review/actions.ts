"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

import { applyExpectedPrices, revalidate, toJson } from "./server";

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; message: string; stale?: { by: string | null; at: string | null } };

const draftLine = z
  .object({
    id: z.uuid().optional(),
    customer_part_number: z.string().max(64).nullish(),
    description: z.string().max(1000).nullish(),
    po_quantity: z
      .string()
      .regex(/^\d+(\.\d{1,3})?$/)
      .nullish(),
    po_uom: z.string().max(20).nullish(),
    po_unit_price: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .nullish(),
    product_id: z.uuid().nullish(),
    match_method: z.enum(["alias", "sku", "gtin", "description", "manual"]).nullish(),
    match_score: z.number().min(0).max(1).nullish(),
    remember_alias: z.boolean().optional(),
    quantity: z
      .string()
      .regex(/^\d+(\.\d{1,3})?$/, "Quantities have at most 3 decimals.")
      .nullish(),
    uom_conversion_note: z.string().max(500).nullish(),
    unit_price: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, "Prices have at most 4 decimals.")
      .nullish(),
    price_source: z.enum(["po_price", "customer_price", "list_price"]).nullish(),
    field_meta: z.record(z.string(), z.unknown()).optional(),
    removed: z.boolean().optional(),
    removed_reason: z.string().max(500).nullish(),
  })
  .strict();

const draft = z.object({
  slug: z.string().min(1).max(40),
  intakeId: z.uuid(),
  version: z.number().int().min(1),
  header: z
    .object({
      customer_id: z.uuid().nullish(),
      customer_po_number: z.string().max(64).nullish(),
      po_date: z.iso.date().nullish(),
      requested_delivery_date: z.iso.date().nullish(),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .nullish(),
      payment_terms: z.string().max(200).nullish(),
      ship_to: z.record(z.string(), z.unknown()).nullish(),
      bill_to: z.record(z.string(), z.unknown()).nullish(),
      ship_to_address_id: z.uuid().nullish(),
      bill_to_address_id: z.uuid().nullish(),
      notes: z.string().max(4000).nullish(),
      document_total: z
        .string()
        .regex(/^\d+(\.\d{1,4})?$/)
        .nullish(),
      field_meta: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  lines: z.array(draftLine).max(500),
});

/** Autosave (FR-REV-10): optimistic concurrency, then re-validation (FR-REV-07). */
export async function saveDraft(input: z.input<typeof draft>): Promise<SaveResult> {
  const parsed = draft.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the values and try again.",
    };
  const { slug, intakeId, version, header, lines } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_inbound_order_draft", {
    p_inbound_order_id: intakeId,
    p_expected_version: version,
    p_header: toJson(header),
    p_lines: toJson(lines),
  });
  if (error) {
    if (error.message.startsWith("stale_version")) {
      let detail: { updated_by?: string; updated_at?: string } = {};
      try {
        detail = JSON.parse(error.details ?? "{}");
      } catch {}
      return {
        ok: false,
        message: messageForDbError(error),
        stale: { by: detail.updated_by ?? null, at: detail.updated_at ?? null },
      };
    }
    return { ok: false, message: messageForDbError(error) };
  }
  try {
    await applyExpectedPrices(supabase, intakeId);
    const snapshot = await revalidate(supabase, intakeId);
    revalidatePath(`/o/${slug}/customer-pos/${intakeId}`);
    return { ok: true, version: snapshot?.intake.version ?? (data as { version: number }).version };
  } catch (e) {
    return { ok: false, message: messageForDbError(e as { message?: string }) };
  }
}

const base = z.object({ slug: z.string().min(1).max(40), intakeId: z.uuid() });
const versioned = base.extend({ version: z.coerce.number().int().min(1) });

function failureList(failures: { message?: string }[]): string {
  return `Not yet: ${failures
    .map((f) => f.message)
    .filter(Boolean)
    .join(" ")}`;
}

/** FR-REV-12: submit; overridable blocking exceptions travel as Override required. */
export async function submitForApproval(_: FormState, form: FormData): Promise<FormState> {
  const parsed = versioned
    .extend({ note: z.string().trim().max(2000).optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  await revalidate(supabase, parsed.data.intakeId);
  const { data: current } = await supabase
    .from("inbound_orders")
    .select("version")
    .eq("id", parsed.data.intakeId)
    .single();
  const { data, error } = await supabase.rpc("submit_inbound_order", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: current?.version ?? parsed.data.version,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  const result = data as { ok: boolean; failures?: { message?: string }[] };
  if (!result.ok) return { ok: false, message: failureList(result.failures ?? []) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  revalidatePath(`/o/${parsed.data.slug}/approvals`);
  return { ok: true, message: "Submitted for approval." };
}

/** FR-REV-13. */
export async function cancelIntake(_: FormState, form: FormData): Promise<FormState> {
  const parsed = versioned
    .extend({
      reason: z.enum(
        ["duplicate", "not_a_purchase_order", "sent_in_error", "other"],
        "Choose a reason.",
      ),
      note: z.string().trim().max(2000).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (parsed.data.reason === "other" && !parsed.data.note)
    return { ok: false, fieldErrors: { note: "Explain why the PO is cancelled." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_inbound_order", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  return { ok: true, message: "The customer PO was cancelled." };
}

/** FR-APR-05: Approver+ overrides an overridable blocking exception with a reason. */
export async function overrideException(_: FormState, form: FormData): Promise<FormState> {
  const parsed = base
    .extend({
      exceptionId: z.uuid(),
      reason: z.string().trim().min(1, "Give a reason for the override.").max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("override_exception", {
    p_exception_id: parsed.data.exceptionId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  revalidatePath(`/o/${parsed.data.slug}/approvals/${parsed.data.intakeId}`);
  return { ok: true, message: "Override recorded." };
}

export async function acknowledgeWarning(_: FormState, form: FormData): Promise<FormState> {
  const parsed = base.extend({ exceptionId: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_exception", {
    p_exception_id: parsed.data.exceptionId,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  return { ok: true, message: "Acknowledged." };
}

export async function assignToMe(_: FormState, form: FormData): Promise<FormState> {
  const parsed = base.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_inbound_order", {
    p_inbound_order_id: parsed.data.intakeId,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  return { ok: true, message: "Assigned to you." };
}

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  selling_uom: string;
  quantity_decimals: number;
  status: string;
};

/** Manual product search on the review screen (FR-REV-05). */
export async function searchProducts(
  organizationId: string,
  query: string,
): Promise<ProductOption[]> {
  const q = query
    .replace(/[^\p{L}\p{N} .-]/gu, " ")
    .trim()
    .slice(0, 60);
  if (!z.uuid().safeParse(organizationId).success || q.length < 1) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, sku, name, selling_uom, quantity_decimals, status")
    .eq("organization_id", organizationId)
    .or(`sku.ilike.*${q}*,name.ilike.*${q}*,gtin.ilike.*${q}*`)
    .order("sku")
    .limit(15);
  return data ?? [];
}
