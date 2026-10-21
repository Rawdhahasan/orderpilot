import "server-only";

import { createHash } from "node:crypto";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 50;

/** File type from content, never from the name or the declared type (FR-UPL-02). */
export function detectMimeType(
  bytes: Uint8Array,
): "application/pdf" | "image/png" | "image/jpeg" | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/** Page count: page objects, falling back to the page tree's /Count. Images count as one page. */
export function countPages(bytes: Uint8Array, mimeType: string): number {
  if (mimeType !== "application/pdf") return 1;
  const text = Buffer.from(bytes).toString("latin1");
  const pages = text.match(/\/Type\s*\/Page(?![a-z])/g)?.length ?? 0;
  if (pages > 0) return pages;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 0;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type Verification =
  | { ok: true; mimeType: string; pageCount: number; sha256: string; size: number }
  | { ok: false; reason: string };

export function verifyDocument(bytes: Uint8Array, declaredMimeType: string): Verification {
  if (bytes.byteLength === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: "The file is larger than 20 MB." };
  const mimeType = detectMimeType(bytes);
  if (!mimeType) return { ok: false, reason: "Only PDF, PNG and JPEG files are accepted." };
  if (mimeType !== declaredMimeType)
    return { ok: false, reason: "The file content does not match its type." };
  const pageCount = countPages(bytes, mimeType);
  if (pageCount < 1) return { ok: false, reason: "The PDF could not be read." };
  if (pageCount > MAX_PAGES) return { ok: false, reason: "The document has more than 50 pages." };
  return { ok: true, mimeType, pageCount, sha256: sha256Hex(bytes), size: bytes.byteLength };
}
