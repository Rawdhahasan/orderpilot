import type { Metadata } from "next";

import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { requireWorkspace } from "@/server/auth/context";

import { InviteForm, MemberActions, RevokeInvitation } from "./member-forms";

export const metadata: Metadata = { title: "Members" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Pending rows past their expiry cannot be accepted; the database checks this at acceptance. */
function hasExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, user, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/settings/members`,
  );
  if (!can(workspace.role, "member.manage")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Owner or Admin" action="manage members" />
      </Card>
    );
  }
  const isOwner = workspace.role === "owner";

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        "id, user_id, role, status, joined_at, profile:profiles!organization_members_user_id_fkey(full_name, email)",
      )
      .eq("organization_id", workspace.id)
      .order("joined_at"),
    supabase
      .from("organization_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", workspace.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  const pending = (invitations ?? []).map((i) => ({ ...i, expired: hasExpired(i.expires_at) }));

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        title="Members"
        description={`People who can use ${workspace.name}, and pending invitations.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm organizationId={workspace.id} slug={orgSlug} isOwner={isOwner} />
          <p className="mt-3 text-caption text-subtle-foreground">
            The invitation link works once and expires after 7 days.{" "}
            {isOwner ? null : "Only an Owner can invite another Owner."}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="members-heading">
        <SectionHeading id="members-heading">Members ({members?.length ?? 0})</SectionHeading>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((m) => (
                <TableRow key={m.id} data-testid={`member-${m.profile?.email ?? m.id}`}>
                  <TableCell>
                    <span className="block font-medium text-navy-900">{m.profile?.full_name}</span>
                    <span className="text-caption text-subtle-foreground">{m.profile?.email}</span>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[m.role]}</TableCell>
                  <TableCell>
                    <Badge tone={m.status === "active" ? "success" : "warning"}>
                      {m.status === "active" ? "Active" : "Suspended"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <MemberActions
                      slug={orgSlug}
                      isOwner={isOwner}
                      member={{
                        id: m.id,
                        name: m.profile?.full_name ?? "",
                        email: m.profile?.email ?? "",
                        role: m.role,
                        status: m.status,
                        isSelf: m.user_id === user.id,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="invitations-heading">
        <SectionHeading id="invitations-heading">Pending invitations</SectionHeading>
        <Card>
          {pending.length === 0 ? (
            <EmptyState
              title="No pending invitations"
              description="Invitations you send appear here until they are accepted."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium text-navy-900">{i.email}</TableCell>
                    <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                    <TableCell>
                      {i.expired ? (
                        <Badge tone="warning">Expired</Badge>
                      ) : (
                        dateFormat.format(new Date(i.expires_at))
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeInvitation invitationId={i.id} slug={orgSlug} email={i.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
