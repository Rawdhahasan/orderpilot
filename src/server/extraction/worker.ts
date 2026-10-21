import "server-only";

import type { DateOrder } from "@/domain/orders/parse";
import { serverEnv } from "@/server/env";
import { createAdminClient } from "@/server/privileged/admin";

import { extractionResultSchema } from "./contract";
import { normalizeResult, overallConfidence } from "./normalize";
import { ProviderError, type ExtractionProvider } from "./provider";
import { simulatedProvider } from "./simulated";

/**
 * The configured provider. Only the simulated provider exists in the MVP
 * (D-07); a real provider is added behind the same interface after the
 * evaluation in Phase 7 (docs/PRODUCTION_READINESS.md §4).
 */
export function activeProvider(): ExtractionProvider {
  const name = serverEnv().EXTRACTION_PROVIDER;
  switch (name) {
    case "simulated":
      return simulatedProvider;
  }
}

/**
 * Processes due extraction jobs from the Postgres queue (the source of truth).
 * Safe to call from any trigger, any number of times, concurrently: claims use
 * SKIP LOCKED, leases and claim tokens, so a job is processed by one worker.
 */
export async function processDueJobs({ maxJobs = 5, budgetMs = 20_000 } = {}) {
  const admin = createAdminClient();
  const env = serverEnv();
  const provider = activeProvider();
  const started = Date.now();
  let processed = 0;

  await admin.rpc("recover_stale_extractions");
  while (processed < maxJobs && Date.now() - started < budgetMs) {
    const { data: claims, error } = await admin.rpc("claim_extraction_job", {
      p_lease_seconds: 120,
    });
    if (error) throw new Error("The extraction queue is unavailable.");
    const job = claims?.[0];
    if (!job) break;
    processed += 1;
    const t0 = Date.now();
    try {
      const [{ data: doc }, { data: intake }] = await Promise.all([
        admin
          .from("source_documents")
          .select("mime_type, sha256, page_count, storage_path")
          .eq("id", job.source_document_id)
          .single(),
        admin
          .from("inbound_orders")
          .select(
            "customer_hint:customers!inbound_orders_organization_id_customer_hint_id_fkey(date_order_hint), organization:organizations(is_demo, locale)",
          )
          .eq("id", job.inbound_order_id)
          .single(),
      ]);
      if (!doc?.sha256 || !doc.storage_path || !intake)
        throw new ProviderError(
          "permanent",
          "document_missing",
          "The stored document could not be found.",
        );
      const file = await admin.storage.from("source-documents").download(doc.storage_path);
      if (file.error || !file.data)
        throw new ProviderError(
          "transient",
          "storage_unavailable",
          "The document could not be read from storage.",
        );
      const org = intake.organization as unknown as { is_demo: boolean; locale: string };
      const hint = ((intake.customer_hint as unknown as { date_order_hint: DateOrder } | null)
        ?.date_order_hint ?? "unknown") as DateOrder;
      const raw = await provider.extract({
        bytes: new Uint8Array(await file.data.arrayBuffer()),
        mimeType: doc.mime_type,
        pageCount: doc.page_count ?? 1,
        sha256: doc.sha256,
        attempt: job.attempt,
        allowFixtures:
          org.is_demo || env.DEPLOYMENT_ENV === "local" || env.DEPLOYMENT_ENV === "test",
      });
      const result = normalizeResult(extractionResultSchema.parse(raw), hint, org.locale);
      await admin.rpc("complete_extraction", {
        p_run_id: job.run_id,
        p_claim_token: job.claim_token,
        p_raw_output: result,
        p_overall_confidence: overallConfidence(result) ?? undefined,
        p_provider_version: provider.version,
        p_duration_ms: Date.now() - t0,
      });
    } catch (error) {
      const failure =
        error instanceof ProviderError
          ? error
          : new ProviderError("transient", "worker_error", "Extraction failed unexpectedly.");
      await admin.rpc("fail_extraction", {
        p_run_id: job.run_id,
        p_claim_token: job.claim_token,
        p_failure_kind: failure.kind,
        p_error_code: failure.code,
        p_error_message: failure.message,
      });
    }
  }
  return { processed };
}
