import type { AppRouter } from "@VISP/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createAuthClient } from "better-auth/react";

export const serverUrl = (
	import.meta.env.VITE_SERVER_URL || "https://api.visp.localhost"
).replace(/\/$/, "");

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	fetchOptions: { credentials: "include" },
	plugins: [],
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
