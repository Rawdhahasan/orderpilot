import "server-only";

import { extractionResultSchema, NOT_RECOGNISED, type ExtractionResult } from "./contract";
import registry from "./fixture-registry.json";
import { ProviderError, type ExtractionProvider } from "./provider";

type Entry = { file: string; failFirstAttempt: boolean; result: unknown };
const FIXTURES = registry as Record<string, Entry>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulated provider (TECHNICAL_ARCHITECTURE.md §9.3): recognises the curated
 * fictional fixtures by SHA-256 and returns their prepared results. Anything
 * else returns `not_recognised` with no values. It never fabricates data.
 */
export const simulatedProvider: ExtractionProvider = {
  name: "simulated",
  version: "simulated-1",
  simulated: true,
  async extract(input): Promise<ExtractionResult> {
    const entry = input.allowFixtures ? FIXTURES[input.sha256] : undefined;
    await delay(entry ? 400 : 100);
    if (!entry) return NOT_RECOGNISED;
    if (entry.failFirstAttempt && input.attempt === 1) {
      throw new ProviderError(
        "transient",
        "simulated_timeout",
        "The simulated provider timed out (first attempt).",
      );
    }
    return extractionResultSchema.parse(entry.result);
  },
};
