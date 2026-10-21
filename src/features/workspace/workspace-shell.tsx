"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAVIGATION } from "@/config/navigation";
import { navigationFor } from "@/domain/auth/navigation-access";
import { ROLE_LABELS, type Role } from "@/domain/auth/roles";
import { signOut } from "@/features/auth/actions";

type WorkspaceLink = { slug: string; name: string; role: Role };

/** The signed-in app shell. Navigation follows the role read from the database. */
export function WorkspaceShell({
  workspace,
  workspaces,
  user,
  children,
}: {
  workspace: WorkspaceLink;
  workspaces: WorkspaceLink[];
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const initials =
    user.name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <AppShell
      basePath={`/o/${workspace.slug}`}
      workspaceName={workspace.name}
      navigation={navigationFor(workspace.role, NAVIGATION)}
      user={{ name: user.name, detail: ROLE_LABELS[workspace.role], initials }}
      segmentLabels={{ members: "Members" }}
      sidebarFooter={
        <div className="mb-1 flex flex-col gap-0.5">
          <Link
            href="/account"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-small text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
          >
            <UserRound aria-hidden className="size-4" />
            Your account
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-small text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
            >
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      }
      topBarActions={
        workspaces.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" data-testid="workspace-switcher">
                {workspace.name}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.slug} asChild>
                  <Link
                    href={`/o/${w.slug}/dashboard`}
                    aria-current={w.slug === workspace.slug ? "page" : undefined}
                  >
                    {w.name}
                    <span className="ml-auto text-caption text-muted-foreground">
                      {ROLE_LABELS[w.role]}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
