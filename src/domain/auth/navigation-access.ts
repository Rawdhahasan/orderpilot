import type { NavGroup } from "@/config/navigation";

import { can } from "./permissions";
import type { Role } from "./roles";

/** Returns only the navigation a role may use; empty groups are dropped. */
export function navigationFor(role: Role, groups: NavGroup[]): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(role, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}
