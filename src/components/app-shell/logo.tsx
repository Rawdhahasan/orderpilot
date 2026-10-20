import { cn } from "@/lib/cn";

/**
 * Placeholder mark (approved P1-3): two strokes forming a forward chevron that
 * also reads as a check mark. A designer produces the final mark later.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="var(--blue-600)" />
      <path
        d="M9 16.5 L14 21.5 L23.5 11"
        fill="none"
        stroke="var(--white)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      {collapsed ? (
        <span className="sr-only">OrderPilot</span>
      ) : (
        <span className="text-[17px] font-semibold tracking-[-0.02em]">OrderPilot</span>
      )}
    </span>
  );
}
