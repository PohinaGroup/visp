import type { AppRouter } from "@VISP/api/routers/index";
import { env } from "@VISP/env/web";
import { Toaster } from "@VISP/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { evlogErrorHandler } from "evlog/nitro/v3";

import { CookieBanner } from "../components/cookie-banner";
import Header from "../components/header";

import appCss from "../index.css?url";

export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
}

function rybbitHeadScripts() {
	const siteId = env.VITE_RYBBIT_SITE_ID;
	if (!siteId) {
		return [];
	}

	return [
		{
			src: "https://app.rybbit.io/api/script.js",
			async: true,
			"data-site-id": siteId,
			// Keep publish URLs and similar secrets out of session replay.
			"data-replay-block-selector": ".rr-block, [data-rybbit-block]",
			"data-replay-mask-text-selectors": '["[data-pii]"]',
			"data-replay-mask-all-inputs": "true",
		},
	];
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	server: {
		middleware: [createMiddleware().server(evlogErrorHandler)],
	},

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "VISP",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				type: "image/png",
				href: "/favicon.png",
			},
		],
		scripts: rybbitHeadScripts(),
	}),

	component: RootDocument,
});

function RootDocument() {
	// ponytail: landing brings its own nav; every other route keeps app chrome
	const isLanding = useLocation({ select: (l) => l.pathname === "/" });
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				{isLanding ? (
					<Outlet />
				) : (
					<div className="grid h-svh grid-rows-[auto_1fr]">
						<Header />
						<Outlet />
					</div>
				)}
				<CookieBanner />
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
