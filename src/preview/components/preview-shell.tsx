"use client";

import { ChevronDown, FlaskConical, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { Banner } from "@/components/feedback/banner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAVIGATION } from "@/config/navigation";
import { navigationFor } from "@/domain/auth/navigation-access";
import { can } from "@/domain/auth/permissions";
import { ROLE_LABELS } from "@/domain/auth/roles";

import { INTAKES, PERSONA_IDS, SALES_ORDERS, USERS, WORKSPACE } from "../fixtures";
import { previewHref } from "../format";
import { PREVIEW_BASE_PATH } from "../guard";
import { usePersona } from "../persona";

import { UploadDialog } from "./upload-dialog";

export const PREVIEW_BANNER_TEXT = "Development Preview — Fictional Data";

const SEGMENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(INTAKES.map((i) => [i.id, i.reference])),
  ...Object.fromEntries(SALES_ORDERS.map((o) => [o.id, o.number])),
  components: "Component gallery",
};

function PersonaSwitcher() {
  const { user, setUserId } = usePersona();
  const personas = PERSONA_IDS.map((id) => USERS.find((u) => u.id === id)!).filter(Boolean);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 bg-white/10 px-2 text-white hover:bg-white/20 hover:text-white"
          data-testid="persona-switcher"
        >
          Viewing as {user.name} · {ROLE_LABELS[user.role]}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          Visual demonstration only. Not an authorisation mechanism.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={user.id} onValueChange={setUserId}>
          {personas.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              <span className="flex flex-col">
                <span>{p.name}</span>
                <span className="text-caption text-muted-foreground">{ROLE_LABELS[p.role]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PreviewShell({ children }: { children: ReactNode }) {
  const { user, role } = usePersona();
  const counts = {
    "customer-pos": INTAKES.filter((i) => i.status === "in_review").length,
    approvals: INTAKES.filter((i) => i.status === "pending_approval").length,
  };

  return (
    <AppShell
      basePath={PREVIEW_BASE_PATH}
      workspaceName={WORKSPACE.name}
      navigation={navigationFor(role, NAVIGATION)}
      counts={counts}
      segmentLabels={SEGMENT_LABELS}
      user={{ name: user.name, detail: ROLE_LABELS[role], initials: user.initials }}
      banner={
        <Banner tone="preview" icon={FlaskConical} actions={<PersonaSwitcher />}>
          <strong className="font-semibold" data-testid="preview-banner">
            {PREVIEW_BANNER_TEXT}
          </strong>
          <span className="hidden text-white/75 sm:inline">
            {" "}
            · {WORKSPACE.name} is invented. Nothing you do here is saved.
          </span>
        </Banner>
      }
      sidebarFooter={
        <Link
          href={previewHref("components")}
          className="mb-1 block rounded-md px-2 py-1.5 text-small text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
        >
          Component gallery
        </Link>
      }
      topBarActions={
        can(role, "intake.upload") ? (
          <UploadDialog
            trigger={
              <Button variant="primary" size="sm">
                <Upload aria-hidden />
                <span className="hidden sm:inline">Upload PO</span>
                <span className="sr-only sm:hidden">Upload PO</span>
              </Button>
            }
          />
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
