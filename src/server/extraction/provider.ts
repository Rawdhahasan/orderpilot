import "server-only";

import type { ExtractionResult } from "./contract";

export type ProviderInput = {
  bytes: Uint8Array;
  mimeType: string;
  pageCount: number;
  sha256: string;
  attempt: number;
  /** Fixture recognition is allowed only in demo workspaces and local or test environments (FR-EXT-03). */
  allowFixtures: boolean;
};

export interface ExtractionProvider {
  name: string;
  version: string;
  /** Simulated providers must be labelled in the UI (FR-EXT-08). */
  simulated: boolean;
  extract(input: ProviderInput): Promise<ExtractionResult>;
}

/** A provider failure with the retry policy it implies (M-04). */
export class ProviderError extends Error {
  constructor(
    readonly kind: "transient" | "permanent",
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
