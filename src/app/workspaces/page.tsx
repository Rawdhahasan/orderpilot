import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/app-shell/logo";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { getWorkspaces, requireUser } from "@/server/auth/context";

export const metadata: Metadata = { title: "Choose a workspace" };

export default async function WorkspacesPage() {
  const { user } = await requireUser("/workspaces");
  const workspaces = await getWorkspaces();
  if (workspaces.length === 1) redirect(`/o/${workspaces[0]!.slug}/dashboard`);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center bg-background px-4 py-12">
      <Logo className="mb-8 text-navy-900" />
      <div className="w-full max-w-md">
        <h1 className="text-h1 font-semibold text-navy-900">Choose a workspace</h1>
        <p className="mt-1 text-body text-subtle-foreground">Signed in as {user.email}</p>
        {workspaces.length === 0 ? (
          <div className="mt-6 rounded-lg border border-border bg-white p-5">
            <p className="text-body font-medium text-navy-900">
              You don&apos;t belong to any workspace yet
            </p>
            <p className="mt-1 text-small text-subtle-foreground">
              Ask a workspace Owner or Admin to invite you. If your access was suspended, they can
              restore it.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/o/${w.slug}/dashboard`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-25"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-navy-900">
                      {w.name}
                    </span>
                    <span className="text-small text-subtle-foreground">{ROLE_LABELS[w.role]}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-small">
          <Link href="/account" className="font-medium text-primary hover:underline">
            Your account
          </Link>
        </p>
      </div>
    </main>
  );
}
