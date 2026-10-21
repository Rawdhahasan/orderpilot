import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Role } from "@/domain/auth/roles";
import { createClient } from "@/server/supabase/server";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  /** FR-ORG-06: demo workspaces show a persistent "Demo data" banner. */
  isDemo: boolean;
  /** Formatting context (DESIGN_SYSTEM.md §10). */
  locale: string;
  currency: string;
  timeZone: string;
};

/** The signed-in user, verified with the Auth server (never trusts the cookie alone). */
export const getAuth = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, aal: null, nextAal: null } as const;
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    supabase,
    user: data.user,
    aal: level?.currentLevel ?? "aal1",
    nextAal: level?.nextLevel ?? "aal1",
  } as const;
});

export async function requireUser(next: string) {
  const auth = await getAuth();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { ...auth, user: auth.user };
}

/** Workspaces where the user is an active member of an active workspace (roles come from the database). */
export const getWorkspaces = cache(async (): Promise<Workspace[]> => {
  const { supabase, user } = await getAuth();
  if (!user) return [];
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      "role, status, organizations!inner(id, name, slug, status, locale, base_currency, timezone, is_demo)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("organizations.status", "active");
  if (error || !data) return [];
  return data
    .map((row) => {
      const org = row.organizations as unknown as {
        id: string;
        name: string;
        slug: string;
        locale: string;
        base_currency: string;
        timezone: string;
        is_demo: boolean;
      };
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: row.role as Role,
        isDemo: org.is_demo,
        locale: org.locale,
        currency: org.base_currency,
        timeZone: org.timezone,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

export const MFA_REQUIRED_ROLES: Role[] = ["owner", "admin"];

/**
 * Resolves the workspace in the URL for the signed-in user. Not a member: the
 * generic not-found page (existence is never revealed). Owners and Admins must
 * hold an MFA-verified session (D-24); the database enforces the same rule.
 */
export async function requireWorkspace(slug: string, path: string) {
  const auth = await requireUser(path);
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.slug === slug);
  if (!workspace) notFound();
  if (MFA_REQUIRED_ROLES.includes(workspace.role) && auth.aal !== "aal2") {
    if (auth.nextAal === "aal2") redirect(`/sign-in/verify?next=${encodeURIComponent(path)}`);
    redirect(`/account/security?required=1&next=${encodeURIComponent(path)}`);
  }
  return { ...auth, workspace, workspaces };
}
