"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import type { Json } from "@/server/db/database.types";
import { createClient } from "@/server/supabase/server";

import { fieldErrorsFrom, type FormState } from "../form-state";

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : Number(v)),
    z.number().min(min).max(max).optional(),
  );

/** Workspace settings and order rules (FR-ORG-02). Role, MFA and Owner-only rules are enforced by the database. */
export async function updateWorkspaceSettings(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      organizationId: z.uuid(),
      slug: z.string().min(1).max(40),
      name: z.string().trim().min(1, "Enter a name.").max(120),
      sales_order_prefix: z
        .string()
        .trim()
        .regex(/^[A-Z0-9]{1,6}$/, "Use 1–6 capital letters or digits."),
      timezone: z.string().trim().min(1).max(64),
      price_tolerance_pct: optionalNumber(0, 100),
      confidence_threshold: optionalNumber(0, 100),
      duplicate_lookback_days: optionalNumber(1, 365),
      require_independent_approval: z.enum(["on", "off"]),
    })
    .safeParse({
      ...Object.fromEntries(form),
      require_independent_approval:
        form.get("require_independent_approval") === "on" ? "on" : "off",
    });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("organizations")
    .select(
      "name, sales_order_prefix, timezone, price_tolerance_pct, confidence_threshold, duplicate_lookback_days, require_independent_approval",
    )
    .eq("id", v.organizationId)
    .single();
  if (!current) return { ok: false, message: messageForDbError({ message: "not_found" }) };

  // Send only what changed, so (for example) an Admin saving other fields
  // never touches the Owner-only independent-approval setting.
  const next: Record<string, string | number | boolean | undefined> = {
    name: v.name,
    sales_order_prefix: v.sales_order_prefix,
    timezone: v.timezone,
    price_tolerance_pct: v.price_tolerance_pct,
    confidence_threshold:
      v.confidence_threshold === undefined ? undefined : v.confidence_threshold / 100,
    duplicate_lookback_days: v.duplicate_lookback_days,
    require_independent_approval: v.require_independent_approval === "on",
  };
  const changes: { [key: string]: Json } = Object.fromEntries(
    Object.entries(next).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined &&
        String(entry[1]) !== String(current[entry[0] as keyof typeof current]),
    ),
  );
  if (Object.keys(changes).length === 0) return { ok: true, message: "No changes to save." };

  const { error } = await supabase.rpc("update_workspace_settings", {
    p_organization_id: v.organizationId,
    p_changes: changes,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${v.slug}`, "layout");
  return { ok: true, message: "Settings saved." };
}
