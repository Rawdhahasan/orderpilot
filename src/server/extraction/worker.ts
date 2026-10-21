import "server-only";

import type { DateOrder } from "@/domain/orders/parse";
import { serverEnv } from "@/server/env";
import { createAdminClient } from "@/server/privileged/admin";

import { extractionResultSchema } from "./contract";
import { createGeminiProvider, type Usage } from "./gemini";
import { normalizeResult, overallConfidence } from "./normalize";
import { ProviderError, type ExtractionProvider } from "./provider";
import { simulatedProvider } from "./simulated";

type Admin = ReturnType<typeof createAdminClient>;

let gemini:
  { key: string; model: string; provider: ExtractionProvider & { lastUsage?: Usage } } | undefined;

/**
 * The provider for a job, by the provider recorded on its run (so a job is
 * always processed by the provider it was queued for). There is never an
 * automatic switch to another provider.
 */
export function providerFor(name: string): ExtractionProvider & { lastUsage?: Usage } {
  if (name === "simulated") return simulatedProvider;
  if (name === "gemini") {
    const env = serverEnv();
    if (!env.GEMINI_API_KEY) {
      throw new ProviderError(
        "permanent",
        "ai_not_configured",
        "AI extraction is not configured (no API key). Enter this order manually.",
      );
    }
    if (!gemini || gemini.key !== env.GEMINI_API_KEY || gemini.model !== env.GEMINI_MODEL) {
      gemini = {
        key: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        provider: createGeminiProvider({
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL,
          timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
          baseUrl: env.GEMINI_BASE_URL,
        }),
      };
    }
    return gemini.provider;
  }
  throw new ProviderError(
    "permanent",
    "ai_not_configured",
    "This extraction provider is not available.",
  );
}

/** Metered providers (real AI) go through usage limits; the simulator does not. */
const METERED = new Set(["gemini"]);

/** True when another AI call fits in the per-minute limit right now. */
async function minuteBudgetLeft(admin: Admin): Promise<boolean> {
  const env = serverEnv();
  const { count } = await admin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - 60_000).toISOString());
  return (count ?? 0) < env.AI_MAX_REQUESTS_PER_MINUTE;
}

/** Usage log line without document content or credentials. */
function logUsage(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "ai_extraction", ...entry }));
}

/**
 * Processes due extraction jobs from the Postgres queue (the source of truth).
 * Safe to call from any trigger, any number of times, concurrently: claims use
 * SKIP LOCKED, leases and claim tokens, so a job is processed by one worker.
 */
export async function processDueJobs({ maxJobs = 5, budgetMs = 20_000 } = {}) {
  const admin = createAdminClient();
  const env = serverEnv();
  const started = Date.now();
  let processed = 0;

  await admin.rpc("recover_stale_extractions");
  while (processed < maxJobs && Date.now() - started < budgetMs) {
    // Free-tier safety: when real AI is in use and this minute's budget is
    // spent, leave the jobs queued (nothing is lost; a later trigger runs them).
    if (METERED.has(env.AI_EXTRACTION_PROVIDER) && !(await minuteBudgetLeft(admin))) break;
    const { data: claims, error } = await admin.rpc("claim_extraction_job", {
      p_lease_seconds: 120,
    });
    if (error) throw new Error("The extraction queue is unavailable.");
    const job = claims?.[0];
    if (!job) break;
    processed += 1;
    await processJob(admin, job);
  }
  return { processed };
}

type Job = {
  run_id: string;
  claim_token: string;
  organization_id: string;
  inbound_order_id: string;
  source_document_id: string;
  provider: string;
  attempt: number;
};

async function processJob(admin: Admin, job: Job) {
  const env = serverEnv();
  const t0 = Date.now();
  let usageId: number | undefined;
  let provider: (ExtractionProvider & { lastUsage?: Usage }) | undefined;
  try {
    provider = providerFor(job.provider);
    const [{ data: doc }, { data: intake }] = await Promise.all([
      admin
        .from("source_documents")
        .select("mime_type, sha256, page_count, size_bytes, storage_path")
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
    if (!doc?.sha256 || !doc.storage_path || !intake) {
      throw new ProviderError(
        "permanent",
        "document_missing",
        "The stored document could not be found.",
      );
    }
    const pages = doc.page_count ?? 1;
    const metered = METERED.has(provider.name);
    if (
      metered &&
      (pages > env.AI_MAX_PAGES || (doc.size_bytes ?? 0) > env.AI_MAX_DOCUMENT_BYTES)
    ) {
      throw new ProviderError(
        "permanent",
        "ai_document_too_large",
        `The document is larger than the AI limit (${env.AI_MAX_PAGES} pages, ${Math.round(env.AI_MAX_DOCUMENT_BYTES / 1048576)} MB). Enter it manually.`,
      );
    }
    const file = await admin.storage.from("source-documents").download(doc.storage_path);
    if (file.error || !file.data) {
      throw new ProviderError(
        "transient",
        "storage_unavailable",
        "The document could not be read from storage.",
      );
    }
    if (metered) {
      const { data: reservation, error } = await admin.rpc("reserve_ai_call", {
        p_organization_id: job.organization_id,
        p_extraction_run_id: job.run_id,
        p_provider: provider.name,
        p_model: provider.version,
        p_pages: pages,
        p_bytes: doc.size_bytes ?? 0,
        p_per_minute: env.AI_MAX_REQUESTS_PER_MINUTE,
        p_per_day: env.AI_MAX_REQUESTS_PER_DAY,
        p_per_workspace_day: env.AI_MAX_REQUESTS_PER_WORKSPACE_PER_DAY,
      });
      if (error)
        throw new ProviderError(
          "transient",
          "ai_usage_unavailable",
          "AI usage could not be checked. The extraction will be retried automatically.",
        );
      const r = reservation as { ok: boolean; id?: number; limit?: string };
      if (!r.ok) {
        if (r.limit === "minute") {
          throw new ProviderError(
            "transient",
            "ai_rate_limited",
            "Too many AI extractions in the last minute. This one will be retried automatically.",
          );
        }
        throw new ProviderError(
          "permanent",
          "ai_quota_exhausted",
          r.limit === "workspace_day"
            ? "This workspace has reached today's AI extraction limit. Enter this order manually, or retry tomorrow."
            : "Today's AI extraction limit is reached. Enter this order manually, or retry tomorrow.",
        );
      }
      usageId = r.id;
    }

    const org = intake.organization as unknown as { is_demo: boolean; locale: string };
    const hint = ((intake.customer_hint as unknown as { date_order_hint: DateOrder } | null)
      ?.date_order_hint ?? "unknown") as DateOrder;
    const raw = await provider.extract({
      bytes: new Uint8Array(await file.data.arrayBuffer()),
      mimeType: doc.mime_type,
      pageCount: pages,
      sha256: doc.sha256,
      attempt: job.attempt,
      allowFixtures: org.is_demo || env.DEPLOYMENT_ENV === "local" || env.DEPLOYMENT_ENV === "test",
    });
    const result = normalizeResult(extractionResultSchema.parse(raw), hint, org.locale);
    if (usageId !== undefined) {
      const u = provider.lastUsage;
      await admin.rpc("finish_ai_call", {
        p_id: usageId,
        p_outcome: "succeeded",
        p_prompt_tokens: u?.promptTokens,
        p_output_tokens: u?.outputTokens,
        p_total_tokens: u?.totalTokens,
        p_duration_ms: Date.now() - t0,
      });
      logUsage({
        run_id: job.run_id,
        provider: provider.name,
        model: provider.version,
        outcome: "succeeded",
        tokens: u?.totalTokens,
        ms: Date.now() - t0,
      });
    }
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
        : new ProviderError(
            "transient",
            "worker_error",
            "Extraction failed unexpectedly. It will be retried automatically.",
          );
    if (usageId !== undefined) {
      await admin.rpc("finish_ai_call", {
        p_id: usageId,
        p_outcome: "failed",
        p_error_code: failure.code,
        p_duration_ms: Date.now() - t0,
      });
    }
    if (provider && METERED.has(provider.name)) {
      logUsage({
        run_id: job.run_id,
        provider: provider.name,
        model: provider.version,
        outcome: "failed",
        code: failure.code,
        ms: Date.now() - t0,
      });
    }
    await admin.rpc("fail_extraction", {
      p_run_id: job.run_id,
      p_claim_token: job.claim_token,
      p_failure_kind: failure.kind,
      p_error_code: failure.code,
      p_error_message: failure.message,
    });
  }
}
