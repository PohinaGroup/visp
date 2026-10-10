import type { RouteComponent } from "@tanstack/react-router";
import {
	Activity,
	DollarSign,
	LayoutDashboard,
	type LucideIcon,
	Radio,
	ScrollText,
	TrendingUp,
	Users,
} from "lucide-react";
import { AuditPage } from "../pages/audit";
import { GrowthPage } from "../pages/growth";
import { OverviewPage } from "../pages/overview";
import { RelaysPage } from "../pages/relays";
import { ReliabilityPage } from "../pages/reliability";
import { UsagePage } from "../pages/usage";
import { UsersPage } from "../pages/users";

export const NAV_GROUPS = ["Dashboards", "Tools"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
	/** Pathname the page is served at; also the nav link target. */
	path: `/${string}`;
	label: string;
	group: NavGroup;
	icon: LucideIcon;
	component: RouteComponent;
}

/**
 * The single source of truth for admin pages: the router builds one route per
 * entry and the shell renders the nav from it, grouped by `group` in
 * `NAV_GROUPS` order. Add a page by creating `src/pages/<name>.tsx` and
 * appending one entry here.
 */
export const NAV_ITEMS: readonly NavItem[] = [
	{
		path: "/",
		label: "Overview",
		group: "Dashboards",
		icon: LayoutDashboard,
		component: OverviewPage,
	},
	{
		path: "/growth",
		label: "Growth",
		group: "Dashboards",
		icon: TrendingUp,
		component: GrowthPage,
	},
	{
		path: "/usage",
		label: "Usage and cost",
		group: "Dashboards",
		icon: DollarSign,
		component: UsagePage,
	},
	{
		path: "/reliability",
		label: "Reliability",
		group: "Dashboards",
		icon: Activity,
		component: ReliabilityPage,
	},
	{
		path: "/users",
		label: "Users",
		group: "Tools",
		icon: Users,
		component: UsersPage,
	},
	{
		path: "/relays",
		label: "Relays",
		group: "Tools",
		icon: Radio,
		component: RelaysPage,
	},
	{
		path: "/audit",
		label: "Audit log",
		group: "Tools",
		icon: ScrollText,
		component: AuditPage,
	},
];

/** The nav entry for a pathname, matching the router's trailing-slash rules. */
export function findNavItem(pathname: string): NavItem | undefined {
	const normalized =
		pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	return NAV_ITEMS.find((item) => item.path === normalized);
}
