import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** Reads the raw palette from globals.css so tokens and documented ratios cannot drift. */
const css = readFileSync(resolve(__dirname, "../../src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tokens = Object.fromEntries(
  [...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
    m[1]!,
    m[2]!.toLowerCase(),
  ]),
);

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const t = (name: string) => {
  const value = tokens[name];
  if (!value) throw new Error(`Token --${name} not found in globals.css`);
  return value;
};

/** Pairs and requirements from docs/DESIGN_SYSTEM.md §4.2. */
const PAIRS: [string, string, number][] = [
  ["navy-900", "white", 4.5],
  ["navy-900", "neutral-25", 4.5],
  ["neutral-700", "white", 4.5],
  ["neutral-600", "white", 4.5],
  ["neutral-600", "neutral-25", 4.5],
  ["neutral-500", "white", 4.5],
  ["neutral-500", "neutral-25", 4.5],
  ["neutral-400", "white", 3],
  ["white", "blue-600", 4.5],
  ["white", "blue-700", 4.5],
  ["blue-600", "white", 4.5],
  ["blue-600", "neutral-25", 4.5],
  ["blue-700", "blue-50", 4.5],
  ["blue-500", "white", 3],
  ["white", "navy-950", 4.5],
  ["sidebar-muted", "navy-950", 4.5],
  ["blue-400", "navy-950", 3],
  ["success-700", "white", 4.5],
  ["success-800", "success-50", 4.5],
  ["warning-700", "white", 4.5],
  ["warning-800", "warning-50", 4.5],
  ["danger-700", "white", 4.5],
  ["danger-800", "danger-50", 4.5],
  ["white", "danger-700", 4.5],
  ["ai-700", "white", 4.5],
  ["ai-800", "ai-50", 4.5],
  ["ai-500", "white", 3],
];

describe("colour contrast (WCAG 2.2 AA, DESIGN_SYSTEM.md §4.2)", () => {
  it.each(PAIRS)("%s on %s meets %d:1", (fg, bg, minimum) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(minimum);
  });

  it("matches the documented ratio for primary buttons (5.25:1)", () => {
    expect(contrast(t("white"), t("blue-600"))).toBeCloseTo(5.25, 1);
  });

  it("removes the default Tailwind palette so only OrderPilot colours exist", () => {
    expect(css).toContain("--color-*: initial;");
  });
});
