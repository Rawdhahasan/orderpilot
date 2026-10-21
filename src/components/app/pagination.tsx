import Link from "next/link";

/** Previous and next links for server-paginated lists. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total <= pageSize)
    return total > 0 ? (
      <p className="mt-3 text-small text-subtle-foreground">{total} shown</p>
    ) : null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const search = new URLSearchParams(
      Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][],
    );
    return `${basePath}?${search.toString()}`;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex items-center justify-between text-small text-subtle-foreground"
    >
      <span>
        {from}–{to} of {total}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="rounded-md border border-input bg-white px-3 py-1.5 font-medium text-navy-900 hover:bg-neutral-50"
          >
            Previous
          </Link>
        ) : null}
        {page < last ? (
          <Link
            href={href(page + 1)}
            className="rounded-md border border-input bg-white px-3 py-1.5 font-medium text-navy-900 hover:bg-neutral-50"
          >
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export function pageFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}

/** Escapes LIKE wildcards in user search text. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
