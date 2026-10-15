import type { AppRouter } from "@VISP/api/routers/index";
import { env } from "@VISP/env/web";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import Loader from "./components/loader";
import {
	isProtectedPath,
	isUnauthorizedError,
	loginRedirectHref,
} from "./lib/query-resilience";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

function getServerUrl(url: string) {
	const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	const processEnv = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	const vercelUrl =
		processEnv?.VERCEL_ENV === "production"
			? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
			: (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
	if (vercelUrl) {
		const origin = vercelUrl.startsWith("http")
			? vercelUrl
			: `https://${vercelUrl}`;
		return `${origin}${normalized}`;
	}

	return `http://localhost:3000${normalized}`;
}
function createQueryClient() {
	let redirecting = false;
	// An expired or revoked session fails every poll the same way: send the
	// user to /login once instead of toasting UNAUTHORIZED forever.
	const handleUnauthorized = (error: unknown) => {
		if (!isUnauthorizedError(error)) return false;
		if (
			!redirecting &&
			typeof window !== "undefined" &&
			isProtectedPath(window.location.pathname)
		) {
			redirecting = true;
			queryClient.cancelQueries();
			queryClient.clear();
			window.location.assign(loginRedirectHref(window.location));
		}
		return true;
	};
	const queryClient: QueryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (handleUnauthorized(error)) return;
				// One toast per query: a failing poller updates it in place.
				toast.error(error.message, {
					id: query.queryHash,
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
		// Mutations toast their own errors; only the session expiry is shared.
		mutationCache: new MutationCache({
			onError: (error) => {
				handleUnauthorized(error);
			},
		}),
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000,
				retry: (failureCount, error) =>
					!isUnauthorizedError(error) && failureCount < 3,
			},
		},
	});
	return queryClient;
}

const trpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${import.meta.env.PROD && typeof window !== "undefined" ? window.location.origin : getServerUrl(env.VITE_SERVER_URL)}/trpc`,
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});

export const getRouter = () => {
	const queryClient = createQueryClient();
	const trpc = createTRPCOptionsProxy({
		client: trpcClient,
		queryClient,
	});

	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		context: { trpc, queryClient },
		defaultPendingComponent: () => <Loader />,
		defaultNotFoundComponent: () => <div>Not Found</div>,
		Wrap: ({ children }) => (
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		),
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
