"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { NavGroup } from "@/config/navigation";
import { cn } from "@/lib/cn";

import { Breadcrumbs } from "./breadcrumbs";
import { Logo } from "./logo";
import { SidebarNav, type NavCounts } from "./sidebar-nav";
import { SkipLink } from "./skip-link";

export type ShellUser = { name: string; detail: string; initials: string };

type ShellLayout = { collapsed: boolean; setCollapsed: (collapsed: boolean) => void };

const ShellLayoutContext = createContext<ShellLayout>({ collapsed: false, setCollapsed: () => {} });

/** Lets dense screens (the review screen) collapse the sidebar to gain width. */
export function useShellLayout(): ShellLayout {
  return useContext(ShellLayoutContext);
}

type AppShellProps = {
  basePath: string;
  workspaceName: string;
  navigation: NavGroup[];
  counts?: NavCounts;
  user: ShellUser;
  /** Persistent banners shown above the top bar (demo, preview, offline). */
  banner?: ReactNode;
  /** Actions on the right of the top bar, for example "Upload PO". */
  topBarActions?: ReactNode;
  /** Extra content at the bottom of the sidebar, above the user. */
  sidebarFooter?: ReactNode;
  /** Breadcrumb labels for record IDs. */
  segmentLabels?: Record<string, string>;
  children: ReactNode;
};

/**
 * App shell (DESIGN_SYSTEM.md §6, §12, §15): expanded sidebar from 1024 px
 * (collapsible), icon rail from 768 px, off-canvas menu below 768 px.
 */
export function AppShell({
  basePath,
  workspaceName,
  navigation,
  counts,
  user,
  banner,
  topBarActions,
  sidebarFooter,
  segmentLabels,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const userBlock = (compact: boolean) => (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-2",
        compact && "justify-center px-0",
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-caption font-semibold text-white"
      >
        {user.initials}
      </span>
      {compact ? (
        <span className="sr-only">
          {user.name}, {user.detail}
        </span>
      ) : (
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-white">{user.name}</span>
          <span className="block truncate text-caption text-sidebar-muted">{user.detail}</span>
        </span>
      )}
    </div>
  );

  return (
    <ShellLayoutContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-dvh bg-background">
        <SkipLink />

        {/* Sidebar: icon rail on md, expanded (collapsible) on lg and above */}
        <aside
          aria-label="Sidebar"
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden flex-col bg-sidebar text-sidebar-foreground md:flex",
            "w-16 transition-[width] duration-200 ease-standard",
            !collapsed && "lg:w-62",
          )}
        >
          <div
            className={cn(
              "flex h-14 shrink-0 items-center px-4",
              collapsed ? "justify-center px-0" : "lg:px-4",
            )}
          >
            <Logo collapsed className={cn(!collapsed && "lg:hidden")} />
            {!collapsed ? <Logo className="hidden lg:inline-flex" /> : null}
          </div>
          {!collapsed ? (
            <p className="hidden truncate px-4 pb-3 text-small text-sidebar-muted lg:block">
              {workspaceName}
            </p>
          ) : null}
          <div className={cn("flex-1 overflow-y-auto px-2 pt-2", !collapsed && "lg:px-3")}>
            <div className={cn(!collapsed && "lg:hidden")}>
              <SidebarNav groups={navigation} basePath={basePath} counts={counts} collapsed />
            </div>
            {!collapsed ? (
              <div className="hidden lg:block">
                <SidebarNav groups={navigation} basePath={basePath} counts={counts} />
              </div>
            ) : null}
          </div>
          <div className={cn("shrink-0 border-t border-white/10 p-2", !collapsed && "lg:p-3")}>
            {sidebarFooter ? (
              <div className={cn("hidden", !collapsed && "lg:block")}>{sidebarFooter}</div>
            ) : null}
            <div className={cn(!collapsed && "lg:hidden")}>{userBlock(true)}</div>
            {!collapsed ? <div className="hidden lg:block">{userBlock(false)}</div> : null}
            <Button
              variant="sidebar"
              size="sm"
              className={cn(
                "mt-1 hidden w-full justify-start lg:flex",
                collapsed && "justify-center px-0",
              )}
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
              {collapsed ? <span className="sr-only">Expand sidebar</span> : "Collapse sidebar"}
            </Button>
          </div>
        </aside>

        {/* Mobile off-canvas navigation */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 max-w-[85vw] border-0 bg-sidebar text-sidebar-foreground"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuButtonRef.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Main navigation for {workspaceName}
            </SheetDescription>
            <div className="flex h-14 items-center px-4">
              <Logo />
            </div>
            <p className="truncate px-4 pb-3 text-small text-sidebar-muted">{workspaceName}</p>
            <div className="flex-1 overflow-y-auto px-3">
              <SidebarNav
                groups={navigation}
                basePath={basePath}
                counts={counts}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
            <div className="border-t border-white/10 p-3">
              {sidebarFooter}
              {userBlock(false)}
            </div>
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-standard md:pl-16",
            !collapsed && "lg:pl-62",
          )}
        >
          {banner}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:px-6">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              className="-ml-2 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu aria-hidden />
            </Button>
            <div className="min-w-0 flex-1">
              <Breadcrumbs basePath={basePath} rootLabel={workspaceName} labels={segmentLabels} />
            </div>
            {topBarActions ? (
              <div className="flex shrink-0 items-center gap-2">{topBarActions}</div>
            ) : null}
          </header>
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-6">
            {children}
          </main>
        </div>
      </div>
    </ShellLayoutContext.Provider>
  );
}
