import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-redirect";
import { requireUser } from "@/server/auth/context";

import { EnrollMfa, RemoveFactor } from "./mfa-forms";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { supabase, user, aal } = await requireUser("/account/security");
  const [{ data: profile }, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("mfa_required").eq("id", user.id).single(),
    supabase.auth.mfa.listFactors(),
  ]);
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  const required = Boolean(profile?.mfa_required);
  const next = params.next ? safeNextPath(params.next) : null;

  return (
    <>
      <PageHeader
        title="Security"
        description="Two-factor authentication protects your account with a code from an authenticator app."
      />
      {params.required && verified.length === 0 ? (
        <p role="alert" className="rounded-md bg-warning-50 px-3 py-2 text-small text-warning-800">
          Your role requires two-factor authentication. Set it up to continue to your workspace.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          {verified.length ? (
            <Badge tone="success">
              <ShieldCheck aria-hidden className="size-3" />
              On
            </Badge>
          ) : (
            <Badge tone={required ? "warning" : "neutral"}>{required ? "Required" : "Off"}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-small text-subtle-foreground">
            {required
              ? "Required for Owners and Admins. Optional for other roles."
              : "Optional for your role, and recommended."}
            {verified.length && aal !== "aal2"
              ? " Verify with your authenticator to manage it."
              : ""}
          </p>
          {verified.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {verified.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-body text-navy-900">
                    {f.friendly_name ?? "Authenticator app"}
                  </span>
                  <RemoveFactor factorId={f.id} />
                </li>
              ))}
            </ul>
          ) : (
            <EnrollMfa />
          )}
          {verified.length && next ? (
            <p className="text-small">
              <Link href={next} className="font-medium text-primary hover:underline">
                Continue to your workspace
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lost your authenticator?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-small text-subtle-foreground">
            Ask a workspace Owner to contact your OrderPilot administrator. After confirming your
            identity by a separate channel, the administrator removes the old authenticator and
            records it in the audit log. You then set up a new one here.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
