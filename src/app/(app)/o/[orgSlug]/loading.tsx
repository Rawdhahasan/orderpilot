import { Skeleton } from "@/components/ui/skeleton";

/** Route skeleton matching the page layout (TECHNICAL_ARCHITECTURE.md §14). */
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
