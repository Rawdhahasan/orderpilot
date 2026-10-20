import { ShieldAlert } from "lucide-react";

export function NoPermissionState({ roleNeeded, action }: { roleNeeded: string; action: string }) {
  return (
    <div
      data-state="no-permission"
      className="flex flex-col items-center gap-1 px-6 py-12 text-center"
    >
      <ShieldAlert aria-hidden className="mb-1 size-5 text-subtle-foreground" />
      <p className="text-h3 font-semibold text-navy-900">You need the {roleNeeded} role</p>
      <p className="max-w-md text-body text-subtle-foreground">
        You need the {roleNeeded} role to {action}. Ask a workspace Owner.
      </p>
    </div>
  );
}
