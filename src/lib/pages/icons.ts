import { Compass, Eye, Flame, HandHeart, Sparkles, Users, type LucideIcon } from "lucide-react";

/**
 * Icons an admin may choose for a section item. A fixed allowlist keyed by name:
 * the dashboard never supplies a component or arbitrary code, only one of these
 * names, which the renderer maps back to the real lucide icon.
 */
export const ICONS = { Compass, Eye, Flame, HandHeart, Sparkles, Users } as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
export const ICON_MAP: Record<IconName, LucideIcon> = ICONS;
