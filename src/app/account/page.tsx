import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/context";

import { PasswordForm, ProfileForm, SignOutButtons } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const { supabase, user } = await requireUser("/account");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  return (
    <>
      <PageHeader title="Your account" description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile?.full_name ?? ""} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-small text-subtle-foreground">
            Last signed in{" "}
            {user.last_sign_in_at ? new Date(user.last_sign_in_at).toUTCString() : "never"}. Signing
            out everywhere ends every session, including on other devices.
          </p>
          <SignOutButtons />
        </CardContent>
      </Card>
    </>
  );
}
