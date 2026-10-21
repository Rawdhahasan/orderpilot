"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

export type Shortfall = {
  line_id: string;
  line_no: number;
  product_id: string;
  requested: number;
  available: number;
};
export type ApproveResult =
  | { kind: "approved"; salesOrderId: string; orderNumber: string; alreadyApproved: boolean }
  | { kind: "needs_stock_decision"; shortfalls: Shortfall[] }
  | { kind: "refused"; message: string };

function refresh(slug: string, intakeId: string) {
  revalidatePath(`/o/${slug}/approvals`);
  revalidatePath(`/o/${slug}/approvals/${intakeId}`);
  revalidatePath(`/o/${slug}/customer-pos/${intakeId}`);
  revalidatePath(`/o/${slug}/dashboard`);
}

/** FR-APR-06/07: atomic, idempotent approval; stock decisions when short. */
export async function approveIntake(input: {
  slug: string;
  intakeId: string;
  version: number;
  decisions: Record<string, "backorder">;
  note?: string;
}): Promise<ApproveResult> {
  const parsed = z
    .object({
      slug: z.string().min(1).max(40),
      intakeId: z.uuid(),
      version: z.number().int().min(1),
      decisions: z.record(z.uuid(), z.literal("backorder")),
      note: z.string().max(2000).optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { kind: "refused", message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_inbound_order", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
    p_stock_decisions: parsed.data.decisions,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { kind: "refused", message: messageForDbError(error) };
  const result = data as {
    ok: boolean;
    code?: string;
    sales_order_id?: string;
    order_number?: string;
    already_approved?: boolean;
    shortfalls?: Shortfall[];
    failures?: { message: string }[];
    reopened_overrides?: number;
  };
  refresh(parsed.data.slug, parsed.data.intakeId);
  if (result.ok) {
    return {
      kind: "approved",
      salesOrderId: result.sales_order_id!,
      orderNumber: result.order_number!,
      alreadyApproved: Boolean(result.already_approved),
    };
  }
  if (result.code === "needs_stock_decision")
    return { kind: "needs_stock_decision", shortfalls: result.shortfalls ?? [] };
  const reopened = result.reopened_overrides
    ? " A duplicate override was re-opened because the conflicting orders changed; review it again."
    : "";
  return {
    kind: "refused",
    message: `Approval is not possible yet: ${(result.failures ?? []).map((f) => f.message).join(" ")}${reopened}`,
  };
}

const decision = z.object({
  slug: z.string().min(1).max(40),
  intakeId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: z.string().trim().min(1, "A reason is required.").max(2000),
});

/** FR-APR-03: return to review with a note. */
export async function requestChanges(_: FormState, form: FormData): Promise<FormState> {
  const parsed = decision.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_changes", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.intakeId);
  return { ok: true, message: "Returned to review with your note." };
}

/** FR-APR-03: reject (terminal). */
export async function rejectIntake(_: FormState, form: FormData): Promise<FormState> {
  const parsed = decision.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_inbound_order", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.intakeId);
  return { ok: true, message: "The customer PO was rejected." };
}
