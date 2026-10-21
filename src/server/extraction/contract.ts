import { z } from "zod";

/**
 * The extraction contract, `extraction.v1` (TECHNICAL_ARCHITECTURE.md §9.2).
 * Providers return raw text per field; our own code parses dates and numbers.
 */
const field = <T extends z.ZodType>(value: T) =>
  z.object({
    raw: z.string().max(2000),
    value: value.nullable(),
    /** Calibrated confidence (0–1). Absent for providers whose confidence is not calibrated. */
    confidence: z.number().min(0).max(1).optional(),
    page: z.number().int().min(1).max(50).optional(),
    ambiguous: z.boolean().optional(),
    /** The provider flagged the value as unclear or conflicting. */
    uncertain: z.boolean().optional(),
  });

export const addressSchema = z.object({
  name: z.string().max(200).optional(),
  line1: z.string().max(200),
  line2: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  postal_code: z.string().max(20).optional(),
  country_code: z.string().length(2).optional(),
});

export const textField = field(z.string().max(4000));
export const addressField = field(addressSchema);

export const extractionLineSchema = z.object({
  line_no: z.number().int().min(1),
  page: z.number().int().min(1).max(50).optional(),
  customer_part_number: textField.optional(),
  description: textField.optional(),
  quantity: textField.optional(),
  uom: textField.optional(),
  unit_price: textField.optional(),
  line_total: textField.optional(),
});

export const extractionResultSchema = z.object({
  schema: z.literal("extraction.v1"),
  status: z.enum(["complete", "partial", "not_recognised"]),
  reason: z.string().max(500).optional(),
  document: z
    .object({
      language: z.string().max(10).optional(),
      currency: z.string().max(3).optional(),
      pages: z.number().int().min(1).max(50).optional(),
      warnings: z.array(z.string().max(200)).max(20).default([]),
    })
    .default({ warnings: [] }),
  header: z
    .object({
      customer_name: textField.optional(),
      account_number: textField.optional(),
      customer_po_number: textField.optional(),
      po_date: textField.optional(),
      requested_delivery_date: textField.optional(),
      currency: textField.optional(),
      payment_terms: textField.optional(),
      ship_to: addressField.optional(),
      bill_to: addressField.optional(),
      notes: textField.optional(),
      document_total: textField.optional(),
    })
    .default({}),
  lines: z.array(extractionLineSchema).max(500).default([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractionLine = z.infer<typeof extractionLineSchema>;

export const NOT_RECOGNISED: ExtractionResult = {
  schema: "extraction.v1",
  status: "not_recognised",
  reason: "The document was not recognised. Enter the order manually.",
  document: { warnings: [] },
  header: {},
  lines: [],
};
