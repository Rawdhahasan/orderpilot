/**
 * Exact decimal arithmetic on strings using scaled BigInt values. Money is
 * numeric(19,4) and quantities numeric(14,3) (docs/DATABASE_ARCHITECTURE.md
 * §3), so 7 fractional digits represent any product exactly.
 */
const SCALE_DIGITS = 7;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function parse(value: string): bigint {
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new RangeError(`Invalid decimal "${value}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > SCALE_DIGITS) throw new RangeError(`Too many decimals in "${value}"`);
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(SCALE_DIGITS, "0"));
  return sign === "-" ? -scaled : scaled;
}

function format(scaled: bigint, digits: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0").slice(0, digits);
  const body = digits > 0 ? `${whole}.${fraction}` : `${whole}`;
  return negative && abs !== 0n ? `-${body}` : body;
}

/** Rounds half away from zero, matching Postgres `round(numeric, n)`. */
function roundScaled(scaled: bigint, digits: number): bigint {
  const unit = 10n ** BigInt(SCALE_DIGITS - digits);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const rounded = ((abs + unit / 2n) / unit) * unit;
  return negative ? -rounded : rounded;
}

export function round(value: string, digits: number): string {
  return format(roundScaled(parse(value), digits), digits);
}

export function add(...values: string[]): string {
  return format(
    values.reduce((sum, v) => sum + parse(v), 0n),
    SCALE_DIGITS,
  );
}

export function subtract(a: string, b: string): string {
  return format(parse(a) - parse(b), SCALE_DIGITS);
}

/** Line total: `round(quantity × unit price, 2)` (DATABASE_ARCHITECTURE.md §6.5). */
export function lineTotal(quantity: string, unitPrice: string): string {
  const product = (parse(quantity) * parse(unitPrice)) / SCALE;
  return format(roundScaled(product, 2), 2);
}

/** Sum of line totals, two decimals. */
export function sumMoney(values: string[]): string {
  return round(add(...values, "0"), 2);
}

export function compare(a: string, b: string): -1 | 0 | 1 {
  const diff = parse(a) - parse(b);
  return diff === 0n ? 0 : diff < 0n ? -1 : 1;
}

/** Smaller of two decimals, never below zero. Used for allocation (M-03). */
export function allocate(requested: string, available: string): string {
  const req = parse(requested);
  const avail = parse(available);
  const allocated = avail <= 0n ? 0n : avail < req ? avail : req;
  return format(allocated, SCALE_DIGITS);
}

export function normalize(value: string, digits: number): string {
  return format(parse(value), digits);
}

/** Divides by a positive integer (for example a pack size), rounded half away from zero. */
export function divideBy(value: string, divisor: number, digits: number): string {
  if (!Number.isInteger(divisor) || divisor <= 0)
    throw new RangeError(`Invalid divisor ${divisor}`);
  const scaled = parse(value);
  const d = BigInt(divisor);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const quotient = (abs * 2n + d) / (2n * d);
  return format(roundScaled(negative ? -quotient : quotient, digits), digits);
}

/** Multiplies by a positive integer (for example converting cases to eaches). */
export function multiplyBy(value: string, factor: number): string {
  if (!Number.isInteger(factor) || factor <= 0) throw new RangeError(`Invalid factor ${factor}`);
  return format(parse(value) * BigInt(factor), SCALE_DIGITS);
}
