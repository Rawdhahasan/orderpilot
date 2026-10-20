"use client";

import { ErrorState } from "@/components/states/error-state";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <ErrorState requestId={error.digest} onRetry={reset} />
    </main>
  );
}
