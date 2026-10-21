import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ORG = "00000000-0000-4000-a000-000000000001";
export const USERS = {
  approver: { id: "00000000-0000-4000-a500-000000000003", email: "ahmed.karim@northstar.example" },
  processor: {
    id: "00000000-0000-4000-a500-000000000004",
    email: "jordan.ellis@northstar.example",
  },
  inventory: { id: "00000000-0000-4000-a500-000000000005", email: "marc.dubois@northstar.example" },
} as const;
export const CUSTOMER = "00000000-0000-4000-a200-000000000002"; // Northgate Facilities (fictional)

function env() {
  const text = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  const values = Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  ) as Record<string, string>;
  const url = values.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("The concurrency suite runs against the local stack only.");
  return {
    url,
    publishable: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    secret: values.SUPABASE_SECRET_KEY!,
  };
}

/** SQL as the table owner inside OrderPilot's local database container only. */
export function sql(statement: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_orderpilot",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      statement,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${process.env.HOME}/.docker/bin:${process.env.PATH}` },
    },
  ).trim();
}

export function serviceClient(): SupabaseClient {
  const { url, secret } = env();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Gives the listed fictional seed users one fresh random password, then signs
 * each in `copies` times (separate sessions, so requests run side by side).
 */
export async function signedInClients<K extends keyof typeof USERS>(
  keys: K[],
  copies = 1,
): Promise<Record<K, SupabaseClient[]>> {
  const { url, publishable } = env();
  const password = randomBytes(12).toString("base64url");
  const admin = serviceClient();
  const out = {} as Record<K, SupabaseClient[]>;
  for (const key of keys) {
    const { error } = await admin.auth.admin.updateUserById(USERS[key].id, { password });
    if (error) throw new Error(`Could not set a local test password: ${error.message}`);
    out[key] = [];
    for (let i = 0; i < copies; i++) {
      const client = createClient(url, publishable, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signedIn = await client.auth.signInWithPassword({ email: USERS[key].email, password });
      if (signedIn.error) throw new Error(`Sign-in failed: ${signedIn.error.message}`);
      out[key].push(client);
    }
  }
  return out;
}

/** A fresh tracked product with the given stock at the default location. */
export function stockedProduct(onHand: number): string {
  const id = randomUUID();
  const sku = `CC-${id.slice(0, 8).toUpperCase()}`;
  sql(`
    insert into public.products (id, organization_id, sku, name, selling_uom, list_price)
    values ('${id}', '${ORG}', '${sku}', 'Concurrency test item ${sku}', 'EA', 1);
    -- The balance row is created with the product (Phase 3); set its stock.
    update public.inventory_balances set on_hand = ${onHand}
     where organization_id = '${ORG}' and product_id = '${id}' and location_id = '00000000-0000-4000-a100-000000000001';
    insert into public.inventory_movements (organization_id, product_id, location_id, movement_type, adjustment_reason,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after)
    values ('${ORG}', '${id}', '00000000-0000-4000-a100-000000000001', 'adjustment', 'opening_balance', ${onHand}, 0, ${onHand}, 0);`);
  return id;
}

/** An intake pending approval, submitted by the Processor, ready to approve. */
export function pendingIntake(
  po: string,
  lines: { productId: string; qty: number }[],
): { id: string; lineIds: string[] } {
  const id = randomUUID();
  const doc = randomUUID();
  const lineIds = lines.map(() => randomUUID());
  const reference = `IN-${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  sql(`
    insert into public.source_documents (id, organization_id, original_filename, mime_type, size_bytes, page_count, sha256, upload_status, uploaded_by, stored_at)
    values ('${doc}', '${ORG}', 'concurrency.pdf', 'application/pdf', 1000, 1, encode(sha256(convert_to('${doc}', 'UTF8')), 'hex'), 'stored', '${USERS.processor.id}', now());
    insert into public.inbound_orders (id, organization_id, reference, source_document_id, status, customer_id, customer_po_number,
      currency, ship_to, validated_version, submitted_by, submitted_at)
    values ('${id}', '${ORG}', '${reference}', '${doc}', 'pending_approval', '${CUSTOMER}', '${po}', 'USD',
      '{"line1": "1 Test Way"}', 1, '${USERS.processor.id}', now());
    ${lines
      .map(
        (
          l,
          i,
        ) => `insert into public.inbound_order_lines (id, organization_id, inbound_order_id, line_no, product_id, match_method, quantity, unit_price, price_source)
      values ('${lineIds[i]}', '${ORG}', '${id}', ${i + 1}, '${l.productId}', 'sku', ${l.qty}, 1, 'list_price');`,
      )
      .join("\n")}`);
  return { id, lineIds };
}

export function balance(productId: string): { onHand: number; reserved: number } {
  const [onHand, reserved] = sql(
    `select on_hand, reserved from public.inventory_balances where product_id = '${productId}'`,
  ).split("|");
  return { onHand: Number(onHand), reserved: Number(reserved) };
}

export function integrityViolations(): string {
  return sql(
    `select string_agg(invariant || ' ' || detail, '; ') from private.inventory_integrity_report('${ORG}')`,
  );
}

export const uniquePo = () => `CC-${randomUUID().slice(0, 8)}`;
