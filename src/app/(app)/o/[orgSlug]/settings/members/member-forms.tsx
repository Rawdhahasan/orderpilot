"use client";

import { useActionState, useState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fieldControlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/auth/roles";
import { INITIAL_FORM_STATE } from "@/features/form-state";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  setMemberStatus,
} from "@/features/members/actions";
import { cn } from "@/lib/cn";

/** Roles the current user may hand out. Only Owners grant Owner; the database enforces the same. */
function grantableRoles(isOwner: boolean): readonly Role[] {
  return isOwner ? ROLES : ROLES.filter((r) => r !== "owner");
}

function RoleSelect({
  id,
  name,
  defaultValue,
  roles,
  label,
}: {
  id: string;
  name: string;
  defaultValue: Role;
  roles: readonly Role[];
  label: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      className={cn(fieldControlClass, "h-8 w-auto pr-8 text-small")}
    >
      {roles.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function InviteForm({
  organizationId,
  slug,
  isOwner,
}: {
  organizationId: string;
  slug: string;
  isOwner: boolean;
}) {
  const [state, action] = useActionState(inviteMember, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="slug" value={slug} />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          className="flex-1"
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          required
          error={state.fieldErrors?.email}
        />
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="processor"
            className={cn(fieldControlClass, "h-9")}
          >
            {grantableRoles(isOwner).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton variant="primary">Send invitation</SubmitButton>
      </div>
    </form>
  );
}

export type MemberRowData = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  isSelf: boolean;
};

export function MemberActions({
  member,
  slug,
  isOwner,
}: {
  member: MemberRowData;
  slug: string;
  isOwner: boolean;
}) {
  const [roleState, roleAction] = useActionState(changeMemberRole, INITIAL_FORM_STATE);
  const [statusState, statusAction] = useActionState(setMemberStatus, INITIAL_FORM_STATE);
  const [removeState, removeAction] = useActionState(removeMember, INITIAL_FORM_STATE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const latest = [removeState, statusState, roleState].find((s) => s.message);
  // Admins cannot change an Owner; nobody changes their own access here.
  const locked = member.isSelf || (!isOwner && member.role === "owner");
  const roles = grantableRoles(isOwner);

  if (locked) {
    return (
      <span className="text-caption text-subtle-foreground">
        {member.isSelf ? "This is you" : "Only an Owner can change an Owner"}
      </span>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="memberId" value={member.id} />
          <RoleSelect
            id={`role-${member.id}`}
            name="role"
            defaultValue={member.role}
            roles={roles}
            label={`Role for ${member.name}`}
          />
          <SubmitButton size="sm">Change role</SubmitButton>
        </form>
        <form action={statusAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="memberId" value={member.id} />
          <input
            type="hidden"
            name="status"
            value={member.status === "active" ? "suspended" : "active"}
          />
          <SubmitButton size="sm">
            {member.status === "active" ? "Suspend" : "Reactivate"}
          </SubmitButton>
        </form>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">
              Remove
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {member.name}?</DialogTitle>
              <DialogDescription>
                They lose access to this workspace. Their past actions stay in the audit history.
                You can invite them again later.
              </DialogDescription>
            </DialogHeader>
            <form
              action={(form) => {
                setConfirmOpen(false);
                removeAction(form);
              }}
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="memberId" value={member.id} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button">Cancel</Button>
                </DialogClose>
                <SubmitButton variant="destructive">Remove member</SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {latest ? <FormMessage ok={latest.ok} message={latest.message} /> : null}
    </div>
  );
}

export function RevokeInvitation({
  invitationId,
  slug,
  email,
}: {
  invitationId: string;
  slug: string;
  email: string;
}) {
  const [state, action] = useActionState(revokeInvitation, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton size="sm" variant="ghost" aria-label={`Withdraw invitation for ${email}`}>
        Withdraw
      </SubmitButton>
      {state.message && !state.ok ? <FormMessage ok={false} message={state.message} /> : null}
    </form>
  );
}
