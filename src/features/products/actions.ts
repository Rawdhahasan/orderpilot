"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

const scope = z.object({ organizationId: z.uuid(), slug: z.string().min(1).max(40) });
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );
const decimal = (label: string, max = 99999999999) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, `Enter ${label} as a number.`)
      .refine((v) => Number(v) <= max, `${label} is too large.`),
  );

const productFields = z
  .object({
    sku: z.string().trim().min(1, "Enter a SKU.").max(64),
    name: z.string().trim().min(1, "Enter a name.").max(200),
    description: optionalText(4000),
    selling_uom: z.string().min(1, "Choose a unit."),
    quantity_decimals: z.coerce.number().int().min(0).max(3),
    gtin: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .string()
        .regex(/^(\d{8}|\d{12,14})$/, "A GTIN has 8, 12, 13 or 14 digits.")
        .optional(),
    ),
    reorder_point: z.preprocess(
      (v) => (v === "" ? undefined : v),
      decimal("the reorder point").optional(),
    ),
  })
  .refine(
    (v) =>
      !v.reorder_point ||
      Number(v.reorder_point) === Number(Number(v.reorder_point).toFixed(v.quantity_decimals)),
    {
      path: ["reorder_point"],
      message: "The reorder point must respect the allowed decimals.",
    },
  );

function productError(error: { code?: string; message?: string } | null): FormState {
  if (error?.code === "23505") {
    return {
      ok: false,
      fieldErrors: error.message?.includes("gtin")
        ? { gtin: "Another product uses this GTIN." }
        : { sku: "Another product uses this SKU." },
    };
  }
  if (error?.code === "23514" && error.message?.includes("gtin"))
    return { ok: false, fieldErrors: { gtin: "The GTIN check digit is not valid." } };
  return { ok: false, message: messageForDbError(error) };
}

/** FR-PROD-02 and FR-PROD-07: the list price and tracking are set at creation. */
export async function createProduct(_: FormState, form: FormData): Promise<FormState> {
  const s = scope.safeParse(Object.fromEntries(form));
  const parsed = productFields.safeParse(Object.fromEntries(form));
  const price = decimal("the list price").safeParse(form.get("list_price"));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!parsed.success || !price.success) {
    return {
      ok: false,
      fieldErrors: {
        ...(parsed.success ? {} : fieldErrorsFrom(parsed.error.issues)),
        ...(price.success ? {} : { list_price: price.error.issues[0]!.message }),
      },
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      organization_id: s.data.organizationId,
      ...parsed.data,
      description: parsed.data.description ?? null,
      gtin: parsed.data.gtin ?? null,
      reorder_point: parsed.data.reorder_point ? Number(parsed.data.reorder_point) : null,
      list_price: Number(price.data),
      track_inventory: form.get("track_inventory") === "on",
    })
    .select("id")
    .single();
  if (error || !data) return productError(error);
  revalidatePath(`/o/${s.data.slug}/products`);
  redirect(`/o/${s.data.slug}/products/${data.id}`);
}

export async function updateProduct(_: FormState, form: FormData): Promise<FormState> {
  const s = scope.extend({ productId: z.uuid() }).safeParse(Object.fromEntries(form));
  const parsed = productFields.safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      ...parsed.data,
      description: parsed.data.description ?? null,
      gtin: parsed.data.gtin ?? null,
      reorder_point: parsed.data.reorder_point ? Number(parsed.data.reorder_point) : null,
    })
    .eq("id", s.data.productId)
    .select("id");
  if (error) return productError(error);
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/products/${s.data.productId}`);
  return { ok: true, message: "Product saved." };
}

/** FR-PROD-03: discontinue instead of deleting; reactivate later. */
export async function setProductStatus(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ productId: z.uuid(), status: z.enum(["active", "discontinued"]) })
    .safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status: s.data.status })
    .eq("id", s.data.productId)
    .select("id");
  if (error) return { ok: false, message: messageForDbError(error) };
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/products/${s.data.productId}`);
  return {
    ok: true,
    message:
      s.data.status === "active" ? "The product is active again." : "The product is discontinued.",
  };
}

/** FR-PROD-04 and FR-PROD-07: audited list price change (Owner, Admin). */
export async function changeListPrice(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ productId: z.uuid(), reason: optionalText(2000) })
    .safeParse(Object.fromEntries(form));
  const price = decimal("the new price").safeParse(form.get("list_price"));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!price.success)
    return { ok: false, fieldErrors: { list_price: price.error.issues[0]!.message } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_price", {
    p_product_id: s.data.productId,
    p_list_price: Number(price.data),
    p_reason: s.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${s.data.slug}/products/${s.data.productId}`);
  return { ok: true, message: "The list price was changed." };
}

/** FR-PROD-08: tracking on creates the balance; off is refused while reserved. */
export async function setTracking(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ productId: z.uuid(), track: z.enum(["on", "off"]) })
    .safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_tracking", {
    p_product_id: s.data.productId,
    p_track_inventory: s.data.track === "on",
  });
  if (error) {
    if (error.message.includes("reservations"))
      return {
        ok: false,
        message: "Tracking cannot be turned off while stock is reserved for open orders.",
      };
    return { ok: false, message: messageForDbError(error) };
  }
  revalidatePath(`/o/${s.data.slug}/products/${s.data.productId}`);
  return {
    ok: true,
    message: s.data.track === "on" ? "Inventory tracking is on." : "Inventory tracking is off.",
  };
}

/** FR-PROD-05: customer-specific prices with validity ranges. */
export async function addCustomerPrice(_: FormState, form: FormData): Promise<FormState> {
  const parsed = scope
    .extend({
      productId: z.uuid(),
      customerId: z.uuid("Choose a customer."),
      valid_from: z.iso.date("Enter a start date."),
      valid_to: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date().optional()),
    })
    .safeParse(Object.fromEntries(form));
  const price = decimal("the price").safeParse(form.get("unit_price"));
  if (!parsed.success || !price.success) {
    return {
      ok: false,
      fieldErrors: {
        ...(parsed.success ? {} : fieldErrorsFrom(parsed.error.issues)),
        ...(price.success ? {} : { unit_price: price.error.issues[0]!.message }),
      },
    };
  }
  if (parsed.data.valid_to && parsed.data.valid_to < parsed.data.valid_from)
    return { ok: false, fieldErrors: { valid_to: "The end date is before the start date." } };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_prices").insert({
    organization_id: parsed.data.organizationId,
    customer_id: parsed.data.customerId,
    product_id: parsed.data.productId,
    unit_price: Number(price.data),
    valid_from: parsed.data.valid_from,
    valid_to: parsed.data.valid_to ?? null,
  });
  if (error) {
    if (error.code === "23P01")
      return {
        ok: false,
        message: "This customer already has a price for this product in that period.",
      };
    return { ok: false, message: messageForDbError(error) };
  }
  revalidatePath(`/o/${parsed.data.slug}/products/${parsed.data.productId}`);
  return { ok: true, message: "Customer price added." };
}

export async function deleteCustomerPrice(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ productId: z.uuid(), priceId: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_prices")
    .delete()
    .eq("id", s.data.priceId)
    .select("id");
  if (error) return { ok: false, message: messageForDbError(error) };
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/products/${s.data.productId}`);
  return { ok: true, message: "Customer price removed." };
}
