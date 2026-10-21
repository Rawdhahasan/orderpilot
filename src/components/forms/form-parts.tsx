"use client";

import { CheckCircle2, OctagonAlert } from "lucide-react";
import {
  createContext,
  useContext,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

/** Labelled input with helper and error text wired for assistive technology. */
export function Field({
  label,
  name,
  error,
  help,
  className,
  ...props
}: { label: string; name: string; error?: string; help?: ReactNode } & ComponentProps<
  typeof Input
>) {
  const id = props.id ?? `field-${name}`;
  const describedBy =
    [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {help ? (
        <p id={`${id}-help`} className="text-caption text-subtle-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-small text-danger-700">
          <OctagonAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Success or error message for a whole form, announced to screen readers. */
export function FormMessage({ ok, message }: { ok: boolean; message?: string }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-small",
        ok ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-800",
      )}
    >
      {ok ? (
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      {message}
    </p>
  );
}

const ActionPendingContext = createContext(false);

/**
 * A form that runs its action in a transition without React's automatic form
 * reset, so what the person typed stays in place when the server returns a
 * validation message or a warning to confirm.
 */
export function ActionForm({
  action,
  children,
  ...props
}: { action: (form: FormData) => void } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
  return (
    <ActionPendingContext value={pending}>
      <form {...props} onSubmit={onSubmit} aria-busy={pending || undefined}>
        {children}
      </form>
    </ActionPendingContext>
  );
}

/** Submit button that shows a spinner and stays disabled while the action runs. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const status = useFormStatus();
  const actionPending = useContext(ActionPendingContext);
  const pending = status.pending || actionPending;
  return (
    <Button type="submit" pending={pending} {...props}>
      {children}
    </Button>
  );
}
