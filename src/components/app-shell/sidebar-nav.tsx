"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavGroup } from "@/config/navigation";
import { cn } from "@/lib/cn";

import { NAV_ICONS } from "./nav-icons";

export type NavCounts = Partial<Record<string, number>>;

export function SidebarNav({
  groups,
  basePath,
  counts = {},
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  basePath: string;
  counts?: NavCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <span className="sr-only">{group.label}</span>
          ) : (
            <p className="mb-1 px-3 text-caption font-medium tracking-[0.04em] text-sidebar-muted uppercase">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = `${basePath}/${item.segment}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = NAV_ICONS[item.key];
              const count = counts[item.key];
              const link = (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-150",
                    "focus-visible:outline-sidebar-indicator",
                    active
                      ? "bg-sidebar-active text-sidebar-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-sidebar-indicator"
                    />
                  ) : null}
                  <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
                  {collapsed ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                  {count !== undefined && count > 0 ? (
                    collapsed ? (
                      <span className="sr-only">, {count}</span>
                    ) : (
                      <span className="rounded-sm bg-white/10 px-1.5 text-caption tabular text-sidebar-foreground">
                        {count}
                        <span className="sr-only"> items</span>
                      </span>
                    )
                  ) : null}
                </Link>
              );
              return (
                <li key={item.key}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
