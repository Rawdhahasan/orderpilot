"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

const scope = z.object({ slug: z.string().min(1).max(40), productId: z.uuid() });
const quantity = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().regex(/^-?\d+(\.\d{1,3})?$/, "Enter a quantity, for example 12 or 2.5."),
);
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

function refresh(slug: string, productId: string) {
  revalidatePath(`/o/${slug}/inventory`);
  revalidatePath(`/o/${slug}/inventory/${productId}`);
}

/** FR-INV-02. */
export async function receiveStock(_: FormState, form: FormData): Promise<FormState> {
  const parsed = scope
    .extend({ quantity, reference: optionalText(120), note: optionalText(1000) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  if (Number(parsed.data.quantity) <= 0)
    return { ok: false, fieldErrors: { quantity: "Enter a quantity greater than zero." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock", {
    p_product_id: parsed.data.productId,
    p_quantity: Number(parsed.data.quantity),
    p_reference: parsed.data.reference,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.productId);
  return { ok: true, message: "Stock received." };
}

/** FR-INV-03 and FR-INV-05. */
export async function adjustStock(_: FormState, form: FormData): Promise<FormState> {
  const parsed = scope
    .extend({
      mode: z.enum(["delta", "count"]),
      quantity,
      reason: z.enum(
        ["opening_balance", "cycle_count", "damaged", "lost", "found", "correction"],
        "Choose a reason.",
      ),
      note: optionalText(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_product_id: parsed.data.productId,
    p_mode: parsed.data.mode,
    p_quantity: Number(parsed.data.quantity),
    p_reason: parsed.data.reason,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  refresh(parsed.data.slug, parsed.data.productId);
  const result = data as { over_committed?: boolean } | null;
  return {
    ok: true,
    message: result?.over_committed
      ? "Stock adjusted. On hand is now below the reserved quantity, so this product is over-committed."
      : "Stock adjusted.",
  };
}
