import type { AppRouter } from "@VISP/api/routers/index";
import { env } from "@VISP/env/web";
import { Toaster } from "@VISP/ui/components/sonner";
import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
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
import { analyticsAllowed } from "../lib/analytics";
import { useLocale } from "../lib/i18n";
import { legalEntity } from "../lib/legal";
import {
	isForcedDarkPath,
	themeInitScript,
	useThemePreference,
} from "../lib/theme";

export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
}

function rybbitHeadScripts(pathname: string | undefined) {
	const siteId = env.VITE_RYBBIT_SITE_ID;
	if (!siteId || !analyticsAllowed(pathname)) {
		return [];
	}

	return [
		{
			src: "https://analytics.huikaton.online/api/script.js",
			async: true,
			"data-site-id": siteId,
			// Also covers client-side navigation onto them after the script loaded.
			"data-skip-patterns": '["/auth/**", "/login", "/overlay", "/device"]',
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

	head: ({ matches }) => ({
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
		scripts: [
			...rybbitHeadScripts(matches.at(-1)?.pathname),
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@graph": [
						{
							"@type": "WebSite",
							"@id": `${legalEntity.siteUrl}/#website`,
							name: legalEntity.productName,
							url: `${legalEntity.siteUrl}/`,
							inLanguage: ["en", "fi"],
							publisher: {
								"@id": `${legalEntity.siteUrl}/#organization`,
							},
						},
						{
							"@type": "Organization",
							"@id": `${legalEntity.siteUrl}/#organization`,
							name: legalEntity.companyName,
							url: `${legalEntity.siteUrl}/`,
							logo: `${legalEntity.siteUrl}/visp-logo.png`,
							sameAs: [legalEntity.sourceUrl],
						},
					],
				}),
			},
		],
	}),

	component: RootDocument,
});

// ponytail: landing pages bring their own nav; every other route keeps app chrome
const LANDING_PATHS = new Set([
	"/",
	"/fi",
	"/phone-only",
	"/with-obs",
	"/fi/phone-only",
	"/fi/with-obs",
]);

function RootDocument() {
	const locale = useLocale();
	const pathname = useLocation({ select: (l) => l.pathname });
	const isLandingPage = LANDING_PATHS.has(
		pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname,
	);
	const forcedDark = isForcedDarkPath(pathname);
	const { resolved } = useThemePreference();
	// The OBS browser source composites over the scene: no chrome, no theme
	// wrapper, and nothing that paints a background. Banners, toasts, and
	// devtools buttons would all go out on stream.
	// /live is the always-on broadcast page: same no-chrome rule, but it
	// paints its own dark background.
	const chromeless = useLocation({
		select: (l) =>
			l.pathname === "/overlay"
				? "overlay"
				: l.pathname === "/live"
					? "live"
					: null,
	});

	if (chromeless) {
		return (
			<html
				lang={locale}
				data-overlay={chromeless === "overlay" ? "" : undefined}
				className={chromeless === "live" ? "dark" : undefined}
			>
				<head>
					<HeadContent />
				</head>
				<body>
					<Outlet />
					<Scripts />
				</body>
			</html>
		);
	}

	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={forcedDark ? "dark" : undefined}
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
				<HeadContent />
			</head>
			<body>
				<Theme mode={forcedDark ? "dark" : resolved} theme={neutralTheme}>
					{isLandingPage ? (
						<Outlet />
					) : (
						<div className="app-shell grid h-svh grid-rows-[auto_1fr]">
							<Header />
							<Outlet />
						</div>
					)}
				</Theme>
				<CookieBanner />
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
