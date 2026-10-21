import { OctagonAlert } from "lucide-react";
import type { ComponentProps } from "react";

import { fieldControlClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

export function NativeSelect({
  label,
  name,
  options,
  error,
  help,
  className,
  ...props
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  error?: string;
  help?: string;
} & ComponentProps<"select">) {
  const id = props.id ?? `field-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        className={cn(fieldControlClass, "h-9")}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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

export function TextArea({
  label,
  name,
  error,
  className,
  ...props
}: { label: string; name: string; error?: string } & ComponentProps<"textarea">) {
  const id = props.id ?? `field-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldControlClass, "min-h-20 py-2")}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-small text-danger-700">
          <OctagonAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
