import {
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { NAV_ITEMS } from "./nav";
import { NotFound } from "./not-found";
import { parseSearch, stringifySearch } from "./search";
import { Shell } from "./shell";

const rootRoute = createRootRoute({
	component: Shell,
	notFoundComponent: NotFound,
});

/** Routes are derived from the nav config so a page is added in one place. */
const routeTree = rootRoute.addChildren(
	NAV_ITEMS.map((item) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path: item.path,
			component: item.component,
		}),
	),
);

/**
 * Pathname routes rely on the SPA fallback that serves index.html for unknown
 * paths: Vite does it in dev/preview and the admin Caddy sites use
 * `try_files {path} /index.html`.
 */
export const router = createRouter({
	routeTree,
	parseSearch,
	stringifySearch,
	defaultPreload: "intent",
	scrollRestoration: true,
});
