import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { fieldControlClass } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Server-rendered list search and filter (a plain GET form, so it works
 * without JavaScript and keeps the state in the URL).
 */
export function SearchForm({
  action,
  query,
  placeholder,
  label,
  filters,
  searchable = true,
}: {
  action: string;
  query?: string;
  placeholder: string;
  label: string;
  filters?: ReactNode;
  /** False for filter-only lists. */
  searchable?: boolean;
}) {
  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label={label}
      className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div className={cn("relative flex-1 sm:max-w-sm", !searchable && "hidden")}>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={placeholder}
          aria-label={label}
          className={cn(fieldControlClass, "h-9 pl-8")}
        />
      </div>
      {filters}
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md border border-input bg-white px-3 text-small font-medium text-navy-900 hover:bg-neutral-50"
      >
        {searchable ? "Search" : "Apply"}
      </button>
    </form>
  );
}

/** A select that submits with the surrounding GET form. */
export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      aria-label={label}
      className={cn(fieldControlClass, "h-9 w-auto pr-8")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
