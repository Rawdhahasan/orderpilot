"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { messageForDbError } from "@/lib/db-errors";
import { verifyDocument } from "@/server/documents/verify";
import { serverEnv } from "@/server/env";
import { processDueJobs } from "@/server/extraction/worker";
import { createAdminClient } from "@/server/privileged/admin";
import { createClient } from "@/server/supabase/server";

import type { FormState } from "../form-state";

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"] as const;

/** Starts work early; the Postgres queue and pg_cron recovery remain the guarantee. */
function kickWorker() {
  after(async () => {
    try {
      await processDueJobs({ maxJobs: 5, budgetMs: 25_000 });
    } catch {
      // The queue keeps the job; recovery or the next trigger picks it up.
    }
  });
}

export type PreparedUpload =
  { ok: true; documentId: string; signedUrl: string } | { ok: false; message: string };

/** Step 1 (FR-UPL-01, FR-UPL-04): a pending document and a signed upload URL for {org}/{document}. */
export async function prepareUpload(input: {
  organizationId: string;
  name: string;
  type: string;
  size: number;
}): Promise<PreparedUpload> {
  const parsed = z
    .object({
      organizationId: z.uuid(),
      name: z.string().min(1).max(255),
      type: z.enum(ACCEPTED, "Only PDF, PNG and JPEG files are accepted."),
      size: z
        .number()
        .int()
        .min(1)
        .max(20 * 1024 * 1024, "Files must be at most 20 MB."),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { data: documentId, error } = await supabase.rpc("create_pending_document", {
    p_organization_id: parsed.data.organizationId,
    p_filename: parsed.data.name,
    p_mime_type: parsed.data.type,
    p_size_bytes: parsed.data.size,
  });
  if (error || !documentId) return { ok: false, message: messageForDbError(error) };
  const signed = await createAdminClient()
    .storage.from("source-documents")
    .createSignedUploadUrl(`${parsed.data.organizationId}/${documentId}`);
  if (signed.error || !signed.data)
    return { ok: false, message: "The upload could not be started. Try again." };
  return { ok: true, documentId, signedUrl: signed.data.signedUrl };
}

export type FinalizedUpload =
  | { ok: true; intakeId: string; reference: string; duplicate: boolean }
  | { ok: false; message: string };

/**
 * Step 2 (FR-UPL-02, FR-UPL-05): the server reads the stored object, checks
 * its real type, size and page count, hashes it, and creates the intake with
 * a queued extraction run. A file that fails verification leaves no intake.
 */
export async function finalizeUpload(input: {
  documentId: string;
  customerHintId?: string | null;
  slug: string;
}): Promise<FinalizedUpload> {
  const parsed = z
    .object({
      documentId: z.uuid(),
      customerHintId: z.uuid().nullish(),
      slug: z.string().min(1).max(40),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: claims } = await supabase.auth.getClaims();
  if (!user.user || !claims?.claims)
    return { ok: false, message: "Your session has ended. Sign in again." };
  const { data: doc } = await supabase
    .from("source_documents")
    .select("id, organization_id, storage_path, mime_type, uploaded_by, upload_status")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!doc?.storage_path || doc.uploaded_by !== user.user.id)
    return { ok: false, message: messageForDbError({ message: "not_found" }) };

  const admin = createAdminClient();
  const file = await admin.storage.from("source-documents").download(doc.storage_path);
  if (file.error || !file.data)
    return { ok: false, message: "The file did not finish uploading. Try again." };
  const verification = verifyDocument(new Uint8Array(await file.data.arrayBuffer()), doc.mime_type);
  if (!verification.ok) {
    await admin.rpc("reject_document", { p_document_id: doc.id, p_reason: verification.reason });
    await admin.storage.from("source-documents").remove([doc.storage_path]);
    return { ok: false, message: verification.reason };
  }

  const { data, error } = await admin.rpc("finalize_document", {
    p_document_id: doc.id,
    p_user_id: user.user.id,
    p_session_id: String(claims.claims.session_id ?? ""),
    p_sha256: verification.sha256,
    p_size_bytes: verification.size,
    p_page_count: verification.pageCount,
    p_mime_type: verification.mimeType,
    p_customer_hint_id: parsed.data.customerHintId ?? undefined,
    p_provider: serverEnv().EXTRACTION_PROVIDER,
  });
  if (error || !data) return { ok: false, message: messageForDbError(error) };
  const result = data as { inbound_order_id: string; reference: string; duplicate_of: unknown[] };
  kickWorker();
  revalidatePath(`/o/${parsed.data.slug}/customer-pos`);
  return {
    ok: true,
    intakeId: result.inbound_order_id,
    reference: result.reference,
    duplicate: result.duplicate_of.length > 0,
  };
}

/**
 * Opening an extracting intake re-runs recovery and starts work
 * (TECHNICAL_ARCHITECTURE.md §8). Returns the current status for polling.
 */
export async function refreshIntake(intakeId: string): Promise<{ status: string | null }> {
  if (!/^[0-9a-f-]{36}$/.test(intakeId)) return { status: null };
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbound_orders")
    .select("status")
    .eq("id", intakeId)
    .maybeSingle();
  if (data?.status === "extracting") {
    try {
      await processDueJobs({ maxJobs: 2, budgetMs: 8_000 });
    } catch {
      // Recovery runs again on the next poll and every minute in the database.
    }
    const again = await supabase
      .from("inbound_orders")
      .select("status")
      .eq("id", intakeId)
      .maybeSingle();
    return { status: again.data?.status ?? null };
  }
  return { status: data?.status ?? null };
}

const versioned = z.object({
  slug: z.string().min(1).max(40),
  intakeId: z.uuid(),
  version: z.coerce.number().int().min(1),
});

/** FR-EXT-07: retry a failed extraction. */
export async function retryExtraction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = versioned.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_extraction", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  kickWorker();
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  return { ok: true, message: "Extraction restarted." };
}

/** FR-EXT-07: continue without extracted values. */
export async function switchToManualEntry(_: FormState, form: FormData): Promise<FormState> {
  const parsed = versioned.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Something went wrong. Refresh the page." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("switch_to_manual_entry", {
    p_inbound_order_id: parsed.data.intakeId,
    p_expected_version: parsed.data.version,
  });
  if (error) return { ok: false, message: messageForDbError(error) };
  revalidatePath(`/o/${parsed.data.slug}/customer-pos/${parsed.data.intakeId}`);
  return { ok: true, message: "Manual entry started." };
}
