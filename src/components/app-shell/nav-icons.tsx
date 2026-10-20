import {
  BookCheck,
  Boxes,
  ClipboardCheck,
  FileInput,
  History,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavIconName } from "@/config/navigation";

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  "customer-pos": FileInput,
  approvals: ClipboardCheck,
  "sales-orders": BookCheck,
  customers: Users,
  products: Package,
  inventory: Boxes,
  audit: History,
  settings: Settings,
};
