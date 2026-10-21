import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/safe-redirect";
import { getAuth } from "@/server/auth/context";

import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  const auth = await getAuth();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (auth.aal === "aal2") redirect(next);
  if (auth.nextAal !== "aal2")
    redirect(`/account/security?required=1&next=${encodeURIComponent(next)}`);
  return (
    <>
      <h1 className="text-h1 font-semibold text-navy-900">Two-factor authentication</h1>
      <p className="mt-1 text-body text-subtle-foreground">
        Enter the 6-digit code from your authenticator app.
      </p>
      <VerifyForm next={next} />
      <p className="mt-6 text-small text-subtle-foreground">
        Lost your authenticator? Ask a workspace Owner to request a reset from your OrderPilot
        administrator.
      </p>
    </>
  );
}
