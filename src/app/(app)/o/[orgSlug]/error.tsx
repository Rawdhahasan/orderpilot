"use client";

import { ErrorState } from "@/components/states/error-state";
import { Card } from "@/components/ui/card";

/** Errors inside a workspace keep the navigation, so people can move on. */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[960px] pt-6">
      <Card>
        <ErrorState requestId={error.digest} onRetry={reset} />
      </Card>
    </div>
  );
}
