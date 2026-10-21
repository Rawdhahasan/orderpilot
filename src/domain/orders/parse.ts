/**
 * Deterministic parsing of extracted text (TECHNICAL_ARCHITECTURE.md §9.2).
 * Providers return text; these functions decide values and flag ambiguity.
 */

export type DateOrder = "dmy" | "mdy" | "ymd" | "unknown";
export type ParsedDate = { value: string | null; ambiguous: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * ISO dates are unambiguous. Slash or dot dates with both parts ≤ 12 and
 * different are ambiguous: the customer's hint decides, else the workspace
 * locale (US → month first), and the result is flagged for confirmation.
 */
export function parseDate(raw: string, hint: DateOrder = "unknown", locale = "en-US"): ParsedDate {
  const text = raw.trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { value: validDate(Number(m[1]), Number(m[2]), Number(m[3])), ambiguous: false };
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return { value: null, ambiguous: false };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mdy = validDate(year, a, b);
  const dmy = validDate(year, b, a);
  if (mdy && dmy && a !== b) {
    const order = hint === "dmy" || hint === "mdy" ? hint : locale === "en-US" ? "mdy" : "dmy";
    return { value: order === "mdy" ? mdy : dmy, ambiguous: true };
  }
  return { value: mdy ?? dmy, ambiguous: false };
}

/**
 * Decimal text to a plain decimal string. Accepts `1,234.50`, `1234.5`,
 * `1.234,50` (comma decimal) and currency symbols. Returns null if unclear.
 */
export function parseDecimal(raw: string): string | null {
  let text = raw.trim().replace(/[^\d.,-]/g, "");
  if (!text || !/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Comma is the decimal separator when followed by 1–2 digits at the end.
    text = /,\d{1,2}$/.test(text)
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else {
    text = text.replace(/,/g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return text.replace(/^(-?)0+(?=\d)/, "$1");
}
