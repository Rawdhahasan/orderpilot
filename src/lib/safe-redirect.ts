/**
 * Returns a same-site path for post-sign-in redirects, or the fallback.
 * Rejects absolute URLs, protocol-relative URLs and backslash tricks so the
 * `next` parameter can never send someone to another site.
 */
export function safeNextPath(value: unknown, fallback = "/workspaces"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://orderpilot.invalid");
    if (url.origin !== "http://orderpilot.invalid") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
