import type { Metadata } from "next";
import Link from "next/link";

import { safeNextPath } from "@/lib/safe-redirect";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  return (
    <>
      <h1 className="text-h1 font-semibold text-navy-900">Sign in</h1>
      <p className="mt-1 text-body text-subtle-foreground">
        OrderPilot accounts are created by invitation.
      </p>
      {params.reset ? (
        <p
          role="status"
          className="mt-4 rounded-md bg-success-50 px-3 py-2 text-small text-success-800"
        >
          Your password was changed. Sign in with your new password.
        </p>
      ) : null}
      <SignInForm next={next} />
      <p className="mt-6 text-small">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Forgot your password?
        </Link>
      </p>
      {process.env.NODE_ENV === "development" ? (
        <p className="mt-4 border-t border-border pt-4 text-small text-subtle-foreground">
          Local development:{" "}
          <Link href="/preview/dashboard" className="font-medium text-primary hover:underline">
            Open the development preview
          </Link>
        </p>
      ) : null}
    </>
  );
}
