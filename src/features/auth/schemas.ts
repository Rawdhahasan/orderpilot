import { z } from "zod";

/** At least 12 characters (FR-AUTH; matches the Auth server minimum). */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use at most 72 characters.");
