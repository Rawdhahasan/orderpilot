import Link from "next/link";

/** Generic not-found page: never reveals whether a record or workspace exists. */
export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center"
    >
      <p className="font-mono text-caption text-muted-foreground">404</p>
      <h1 className="mt-2 text-h1 font-semibold text-navy-900">Page not found</h1>
      <p className="mt-1 max-w-md text-body text-subtle-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="mt-5 text-body font-medium text-primary hover:underline">
        Go to OrderPilot
      </Link>
    </main>
  );
}
