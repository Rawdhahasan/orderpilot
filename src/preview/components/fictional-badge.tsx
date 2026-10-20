import { FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Marks content computed from fictional demonstration fixtures. */
export function FictionalBadge({ label = "Fictional data" }: { label?: string }) {
  return (
    <Badge tone="neutral" data-fictional>
      <FlaskConical aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}
