import { headers } from "next/headers";
import type { ReactNode } from "react";

import { requireWorkspace } from "@/server/auth/context";
import { WorkspaceShell } from "@/features/workspace/workspace-shell";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const path = (await headers()).get("x-orderpilot-path") ?? `/o/${orgSlug}/dashboard`;
  const { supabase, user, workspace, workspaces } = await requireWorkspace(orgSlug, path);
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  return (
    <WorkspaceShell
      workspace={workspace}
      workspaces={workspaces}
      user={{ name: profile?.full_name ?? user.email ?? "", email: user.email ?? "" }}
    >
      {children}
    </WorkspaceShell>
  );
}
