import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  ScrollText,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Tab =
  | "registrations"
  | "events"
  | "chapters"
  | "leaders"
  | "pages"
  | "users"
  | "logs"
  | "settings";

export interface NavItem {
  key: Tab;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only a provincial youth head sees this. Mirrors the RLS scope, it does not create it. */
  pyhOnly?: boolean;
  /** Sidebar grouping. Purely presentational. */
  group: "Manage" | "Content" | "Organisation";
}

/**
 * The single source of truth for admin navigation, shared by the desktop
 * sidebar and the mobile drawer so the two can never drift.
 *
 * `label` values are load-bearing beyond the UI: prove:editor asserts that a
 * PYH is offered exactly one link named "Pages". Renaming one here without
 * updating that suite will fail the browser proof.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "registrations", href: "/admin", label: "Registrations", icon: ClipboardList, group: "Manage" },
  { key: "events", href: "/admin/events", label: "Events", icon: CalendarDays, group: "Manage" },
  { key: "chapters", href: "/admin/chapters", label: "Chapters", icon: Building2, group: "Organisation" },
  { key: "leaders", href: "/admin/leaders", label: "Leaders", icon: Users, group: "Organisation" },
  { key: "pages", href: "/admin/pages", label: "Pages", icon: FileText, group: "Content", pyhOnly: true },
  { key: "users", href: "/admin/users", label: "Users", icon: UserCog, group: "Organisation", pyhOnly: true },
  { key: "logs", href: "/admin/logs", label: "Logs", icon: ScrollText, group: "Content", pyhOnly: true },
  { key: "settings", href: "/admin/settings", label: "Settings", icon: Settings, group: "Content", pyhOnly: true },
];

export const NAV_GROUPS = ["Manage", "Organisation", "Content"] as const;

export function visibleNavItems(isPYH: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.pyhOnly || isPYH);
}
