import type { AppRouter } from "@VISP/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const serverUrl = (
	import.meta.env.VITE_SERVER_URL ||
	(import.meta.env.PROD ? window.location.origin : "https://api.visp.localhost")
).replace(/\/$/, "");

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	fetchOptions: { credentials: "include" },
	plugins: [genericOAuthClient()],
});

export const trpc = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${serverUrl}/trpc`,
			fetch(url, options) {
				return fetch(url, { ...options, credentials: "include" });
			},
		}),
	],
});
