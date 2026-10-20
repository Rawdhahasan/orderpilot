"use client";

import { toast } from "sonner";

export const PREVIEW_ONLY_TITLE = "Preview only — nothing was saved";

/** Every interactive preview action ends here: it states plainly that nothing happened. */
export function previewOnly(whatWouldHappen: string): void {
  toast(PREVIEW_ONLY_TITLE, { description: whatWouldHappen });
}
