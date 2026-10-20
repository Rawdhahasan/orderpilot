/** Formatting context for a workspace (docs/DESIGN_SYSTEM.md §10). */
export type FormatContext = {
  /** BCP 47 locale, for example `en-US`, `en-GB`, `en-CA`, `en-IE`. */
  locale: string;
  /** ISO 4217 currency code of the workspace. */
  currency: string;
  /** IANA time zone of the workspace. */
  timeZone: string;
};

/** Shown in tables when a value is absent. */
export const EMPTY_VALUE = "–";

/** Decimal values travel as strings so that no floating point rounding occurs. */
export type DecimalString = string;
