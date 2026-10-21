import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth/context";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const auth = await getAuth();
  if (!auth.user) {
    return (
      <>
        <h1 className="text-h1 font-semibold text-navy-900">Link expired</h1>
        <p className="mt-1 text-body text-subtle-foreground">
          This reset link is no longer valid. Request a new one.
        </p>
        <p className="mt-6 text-small">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new link
          </Link>
        </p>
      </>
    );
  }
  // Accounts with an authenticator confirm it before changing the password.
  if (auth.nextAal === "aal2" && auth.aal !== "aal2")
    redirect("/sign-in/verify?next=/reset-password");
  return (
    <>
      <h1 className="text-h1 font-semibold text-navy-900">Choose a new password</h1>
      <p className="mt-1 text-body text-subtle-foreground">
        For {auth.user.email}. Use at least 12 characters.
      </p>
      <ResetForm />
    </>
  );
}
