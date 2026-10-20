"use client";

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

/** Explains an action that a future phase delivers, instead of pretending to do it. */
export function PhaseDialog({
  trigger,
  title,
  description,
  phase,
  feature,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  phase: string;
  feature: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PhaseNotice phase={phase} feature={feature} />
        <DialogFooter>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
