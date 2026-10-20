import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  LoaderCircle,
  OctagonAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge, type Tone } from "@/components/ui/badge";
import type {
  CustomerStatus,
  IntakeStatus,
  ProductStatus,
  SalesOrderStatus,
  StockStatus,
} from "@/domain/orders/statuses";
import { cn } from "@/lib/cn";

type StatusDef = { label: string; tone: Tone; icon?: LucideIcon };

/** Status badges (DESIGN_SYSTEM.md §9.4). Every badge has a text label. */
export const INTAKE_STATUS: Record<IntakeStatus, StatusDef> = {
  received: { label: "Received", tone: "neutral", icon: CircleDashed },
  extracting: { label: "Extracting", tone: "neutral", icon: LoaderCircle },
  extraction_failed: { label: "Extraction failed", tone: "danger", icon: OctagonAlert },
  in_review: { label: "In review", tone: "info" },
  pending_approval: { label: "Awaiting approval", tone: "warning", icon: Clock },
  approved: { label: "Approved", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const SALES_ORDER_STATUS: Record<SalesOrderStatus, StatusDef> = {
  confirmed: { label: "Confirmed", tone: "info" },
  fulfilled: { label: "Fulfilled", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const CUSTOMER_STATUS: Record<CustomerStatus, StatusDef> = {
  active: { label: "Active", tone: "success" },
  on_hold: { label: "On hold", tone: "warning", icon: Clock },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const PRODUCT_STATUS: Record<ProductStatus, StatusDef> = {
  active: { label: "Active", tone: "success" },
  discontinued: { label: "Discontinued", tone: "neutral", icon: Ban },
};

export const STOCK_STATUS: Record<StockStatus, StatusDef> = {
  in_stock: { label: "In stock", tone: "success" },
  low: { label: "Low", tone: "warning" },
  out_of_stock: { label: "Out of stock", tone: "danger" },
  over_committed: { label: "Over-committed", tone: "danger", icon: AlertTriangle },
};

const DOT: Record<Tone, string> = {
  neutral: "bg-neutral-500",
  info: "bg-blue-600",
  success: "bg-success-700",
  warning: "bg-warning-700",
  danger: "bg-danger-700",
  ai: "bg-ai-500",
};

export function StatusBadge({ def, className }: { def: StatusDef; className?: string }) {
  const Icon = def.icon;
  return (
    <Badge tone={def.tone} className={className}>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn("size-3", Icon === LoaderCircle && "motion-safe:animate-spin")}
        />
      ) : (
        <span aria-hidden className={cn("size-1.5 rounded-full", DOT[def.tone])} />
      )}
      {def.label}
    </Badge>
  );
}

export function IntakeStatusBadge({ status }: { status: IntakeStatus }) {
  return <StatusBadge def={INTAKE_STATUS[status]} />;
}

export function SalesOrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  return <StatusBadge def={SALES_ORDER_STATUS[status]} />;
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <StatusBadge def={CUSTOMER_STATUS[status]} />;
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <StatusBadge def={PRODUCT_STATUS[status]} />;
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return <StatusBadge def={STOCK_STATUS[status]} />;
}
