"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const customerFields = z.object({
  name: z.string().trim().min(1, "Enter the customer name.").max(200),
  account_number: optionalText(40),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.email("Enter a valid email address.").max(320).optional(),
  ),
  phone: optionalText(40),
  payment_terms: optionalText(200),
  date_order_hint: z.enum(["dmy", "mdy", "ymd", "unknown"]).default("unknown"),
  notes: optionalText(4000),
});

const scope = z.object({ organizationId: z.uuid(), slug: z.string().min(1).max(40) });

/** Optional fields become null so clearing a field in the form clears it in the database. */
function nullify<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? null])) as {
    [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K];
  };
}

function uniqueMessage(error: { code?: string } | null) {
  return error?.code === "23505"
    ? { account_number: "Another customer already uses this account number." }
    : undefined;
}

/** FR-CUST-02 and FR-CUST-08: create, warning first about close name matches. */
export async function createCustomer(
  _: FormState,
  form: FormData,
): Promise<FormState & { similar?: string[] }> {
  const s = scope.safeParse(Object.fromEntries(form));
  const parsed = customerFields.safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const supabase = await createClient();
  if (form.get("confirmDuplicate") !== "yes") {
    const { data: similar } = await supabase.rpc("find_similar_customers", {
      p_organization_id: s.data.organizationId,
      p_name: parsed.data.name,
    });
    if (similar && similar.length > 0) {
      return {
        ok: false,
        message:
          "Possible duplicate customer. Check the list below, then create it anyway if it is a different business.",
        similar: similar.map((c) => c.name),
      };
    }
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ organization_id: s.data.organizationId, ...nullify(parsed.data) })
    .select("id")
    .single();
  if (error || !data) {
    const fieldErrors = uniqueMessage(error);
    return fieldErrors
      ? { ok: false, fieldErrors }
      : { ok: false, message: messageForDbError(error) };
  }
  revalidatePath(`/o/${s.data.slug}/customers`);
  redirect(`/o/${s.data.slug}/customers/${data.id}`);
}

export async function updateCustomer(_: FormState, form: FormData): Promise<FormState> {
  const s = scope.extend({ customerId: z.uuid() }).safeParse(Object.fromEntries(form));
  const parsed = customerFields.safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(nullify(parsed.data))
    .eq("id", s.data.customerId)
    .select("id");
  if (error) {
    const fieldErrors = uniqueMessage(error);
    return fieldErrors
      ? { ok: false, fieldErrors }
      : { ok: false, message: messageForDbError(error) };
  }
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/customers/${s.data.customerId}`);
  return { ok: true, message: "Customer saved." };
}

/** FR-CUST-04: hold and release (Approver+), deactivate and reactivate (Admin+). */
export async function setCustomerStatus(_: FormState, form: FormData): Promise<FormState> {
  const parsed = scope
    .extend({
      customerId: z.uuid(),
      status: z.enum(["active", "on_hold", "inactive"]),
      reason: optionalText(2000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (parsed.data.status === "on_hold" && !parsed.data.reason)
    return { ok: false, fieldErrors: { reason: "A hold needs a reason." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_status", {
    p_customer_id: parsed.data.customerId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customers/${parsed.data.customerId}`);
  const done = {
    active: "The customer is active.",
    on_hold: "The customer is on hold.",
    inactive: "The customer is inactive.",
  };
  return { ok: true, message: done[parsed.data.status] };
}

const addressFields = z.object({
  type: z.enum(["billing", "shipping"]),
  label: optionalText(80),
  line1: z.string().trim().min(1, "Enter the first address line.").max(200),
  line2: optionalText(200),
  line3: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postal_code: optionalText(20),
  country_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code, for example US or GB."),
  is_default: z.preprocess((v) => v === "on", z.boolean()),
});

/** FR-CUST-03: add or edit an address; one default per type. */
export async function saveAddress(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ customerId: z.uuid(), addressId: z.uuid().optional().or(z.literal("")) })
    .safeParse(Object.fromEntries(form));
  const parsed = addressFields.safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const values = nullify(parsed.data);

  if (parsed.data.is_default) {
    // Only one default per type: clear the current one first.
    const clear = await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", s.data.customerId)
      .eq("type", parsed.data.type)
      .eq("is_default", true)
      .neq("id", s.data.addressId || "00000000-0000-0000-0000-000000000000");
    if (clear.error) return { ok: false, message: messageForDbError(clear.error) };
  }
  const result = s.data.addressId
    ? await supabase
        .from("customer_addresses")
        .update(values)
        .eq("id", s.data.addressId)
        .select("id")
    : await supabase
        .from("customer_addresses")
        .insert({
          ...values,
          organization_id: s.data.organizationId,
          customer_id: s.data.customerId,
        })
        .select("id");
  if (result.error) return { ok: false, message: messageForDbError(result.error) };
  if (!result.data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/customers/${s.data.customerId}`);
  return { ok: true, message: s.data.addressId ? "Address saved." : "Address added." };
}

export async function archiveAddress(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ customerId: z.uuid(), addressId: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .update({ status: "archived", is_default: false })
    .eq("id", s.data.addressId)
    .select("id");
  if (error) return { ok: false, message: messageForDbError(error) };
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/customers/${s.data.customerId}`);
  return { ok: true, message: "Address archived." };
}

/** FR-CUST-05: map a customer part number to one of our products. */
export async function addAlias(_: FormState, form: FormData): Promise<FormState> {
  const parsed = scope
    .extend({
      customerId: z.uuid(),
      productId: z.uuid("Choose a product."),
      customer_part_number: z.string().trim().min(1, "Enter the customer's part number.").max(64),
      customer_description: optionalText(400),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_item_aliases").insert({
    organization_id: parsed.data.organizationId,
    customer_id: parsed.data.customerId,
    product_id: parsed.data.productId,
    customer_part_number: parsed.data.customer_part_number,
    customer_description: parsed.data.customer_description ?? null,
  });
  if (error) {
    if (error.code === "23505")
      return {
        ok: false,
        fieldErrors: {
          customer_part_number:
            "This part number is already mapped. Archive the old mapping first.",
        },
      };
    return { ok: false, message: messageForDbError(error) };
  }
  revalidatePath(`/o/${parsed.data.slug}/customers/${parsed.data.customerId}`);
  return { ok: true, message: "Part number mapped." };
}

export async function archiveAlias(_: FormState, form: FormData): Promise<FormState> {
  const s = scope
    .extend({ customerId: z.uuid(), aliasId: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!s.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_item_aliases")
    .update({ status: "archived" })
    .eq("id", s.data.aliasId)
    .select("id");
  if (error) return { ok: false, message: messageForDbError(error) };
  if (!data?.length) return { ok: false, message: messageForDbError({ code: "42501" }) };
  revalidatePath(`/o/${s.data.slug}/customers/${s.data.customerId}`);
  return { ok: true, message: "Mapping archived." };
}
