"use client";

import { FileUp } from "lucide-react";
import type { ReactNode } from "react";

import { PhaseNotice } from "@/components/states/phase-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Shows the upload experience without accepting any file. */
export function UploadDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload customer POs</DialogTitle>
          <DialogDescription>
            PDF, PNG or JPEG, up to 20 MB and 50 pages each. Up to 10 files at once.
          </DialogDescription>
        </DialogHeader>
        <div
          aria-disabled
          className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-neutral-400 bg-neutral-25 px-6 py-10 text-center"
        >
          <FileUp aria-hidden className="size-6 text-subtle-foreground" />
          <p className="text-body font-medium text-navy-900">Drop PO files here</p>
          <p className="text-small text-subtle-foreground">
            In the preview no file is read or uploaded.
          </p>
        </div>
        <PhaseNotice phase="4A" feature="Uploading to private storage" />
        <DialogFooter>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
