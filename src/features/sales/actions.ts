"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

const order = z.object({
  slug: z.string().min(1).max(40),
  salesOrderId: z.uuid(),
  version: z.coerce.number().int().min(1),
});

function refresh(slug: string, salesOrderId: string) {
  revalidatePath(`/o/${slug}/sales-orders`);
  revalidatePath(`/o/${slug}/sales-orders/${salesOrderId}`);
  revalidatePath(`/o/${slug}/inventory`);
  revalidatePath(`/o/${slug}/dashboard`);
}

/** FR-SO-05: issue the reserved quantities. */
export async function fulfilOrder(_: FormState, form: FormData): Promise<FormState> {
  const parsed = order.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fulfill_sales_order", {
    p_sales_order_id: parsed.data.salesOrderId,
    p_expected_version: parsed.data.version,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.salesOrderId);
  return { ok: true, message: "Marked fulfilled." };
}

/** FR-SO-04: cancel and release reservations. */
export async function cancelOrder(_: FormState, form: FormData): Promise<FormState> {
  const parsed = order
    .extend({ reason: z.string().trim().min(1, "A reason is required.").max(2000) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sales_order", {
    p_sales_order_id: parsed.data.salesOrderId,
    p_expected_version: parsed.data.version,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.salesOrderId);
  return { ok: true, message: "The sales order was cancelled and its reservations released." };
}

/** FR-SO-08: handled outside OrderPilot; inventory is never changed. */
export async function markBackorderHandled(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      slug: z.string().min(1).max(40),
      salesOrderId: z.uuid(),
      lineId: z.uuid(),
      reason: z.string().trim().min(1, "A reason is required.").max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_backorder_handled", {
    p_sales_order_line_id: parsed.data.lineId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.salesOrderId);
  return { ok: true, message: "Recorded as handled externally." };
}
