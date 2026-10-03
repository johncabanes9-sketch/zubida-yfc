import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Images,
  Inbox,
  Newspaper,
  ScrollText,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Tab =
  | "registrations"
  | "events"
  | "messages"
  | "chapters"
  | "leaders"
  | "gallery"
  | "news"
  | "pages"
  | "users"
  | "logs"
  | "settings";

/**
 * A nav item carries no icon component.
 *
 * The desktop sidebar is a server component and the mobile drawer is a client
 * one, and both are handed this list. A React component is a function, and a
 * function cannot cross the server/client boundary as a prop — doing so throws
 * "Functions cannot be passed directly to Client Components" at request time,
 * which no amount of tsc, lint or `next build` will catch because it is a
 * runtime error on an authenticated route.
 *
 * So the item stays serialisable and each side looks the icon up in NAV_ICONS
 * from its own import instead.
 */
export interface NavItem {
  key: Tab;
  href: string;
  label: string;
  /** Only a provincial youth head sees this. Mirrors the RLS scope, it does not create it. */
  pyhOnly?: boolean;
  /** Sidebar grouping. Purely presentational. */
  group: "Manage" | "Content" | "Organisation";
}

/** Resolved locally on whichever side of the boundary is rendering. */
export const NAV_ICONS: Record<Tab, LucideIcon> = {
  registrations: ClipboardList,
  events: CalendarDays,
  messages: Inbox,
  chapters: Building2,
  leaders: Users,
  gallery: Images,
  news: Newspaper,
  pages: FileText,
  users: UserCog,
  logs: ScrollText,
  settings: Settings,
};

/**
 * The single source of truth for admin navigation, shared by the desktop
 * sidebar and the mobile drawer so the two can never drift.
 *
 * `label` values are load-bearing beyond the UI: prove:editor asserts that a
 * PYH is offered exactly one link named "Pages". Renaming one here without
 * updating that suite will fail the browser proof.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "registrations", href: "/admin", label: "Registrations", group: "Manage" },
  { key: "events", href: "/admin/events", label: "Events", group: "Manage" },
  { key: "messages", href: "/admin/messages", label: "Messages", group: "Manage", pyhOnly: true },
  { key: "chapters", href: "/admin/chapters", label: "Chapters", group: "Organisation" },
  { key: "leaders", href: "/admin/leaders", label: "Leaders", group: "Organisation" },
  { key: "gallery", href: "/admin/gallery", label: "Gallery", group: "Content" },
  { key: "news", href: "/admin/news", label: "News", group: "Content", pyhOnly: true },
  { key: "pages", href: "/admin/pages", label: "Pages", group: "Content", pyhOnly: true },
  { key: "users", href: "/admin/users", label: "Users", group: "Organisation", pyhOnly: true },
  { key: "logs", href: "/admin/logs", label: "Logs", group: "Content", pyhOnly: true },
  { key: "settings", href: "/admin/settings", label: "Settings", group: "Content", pyhOnly: true },
];

export const NAV_GROUPS = ["Manage", "Organisation", "Content"] as const;

export function visibleNavItems(isPYH: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.pyhOnly || isPYH);
}
