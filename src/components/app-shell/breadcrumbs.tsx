"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SEGMENT_LABELS } from "@/config/navigation";

/** Breadcrumbs derived from the URL below the workspace base path. */
export function Breadcrumbs({
  basePath,
  rootLabel,
  labels = {},
}: {
  basePath: string;
  rootLabel: string;
  /** Display labels for record IDs in the URL, for example `in-001042` → `IN-001042`. */
  labels?: Record<string, string>;
}) {
  const pathname = usePathname();
  const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  const segments = rest.split("/").filter(Boolean);

  const crumbs = segments.map((segment, index) => ({
    label: labels[segment] ?? SEGMENT_LABELS[segment] ?? decodeURIComponent(segment),
    href: `${basePath}/${segments.slice(0, index + 1).join("/")}`,
  }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-small">
        <li className="hidden shrink-0 text-subtle-foreground sm:block">{rootLabel}</li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1">
              <ChevronRight
                aria-hidden
                className={
                  index === 0
                    ? "hidden size-3.5 shrink-0 text-muted-foreground sm:block"
                    : "size-3.5 shrink-0 text-muted-foreground"
                }
              />
              {last ? (
                <span aria-current="page" className="truncate font-medium text-navy-900">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-subtle-foreground hover:text-navy-900"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
