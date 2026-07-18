import type { AppRouter } from "@VISP/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL?.replace(/\/$/, "");

if (!serverUrl) {
	throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");
}

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	fetchOptions: { credentials: "include" },
	plugins: [genericOAuthClient()],
});

export function authCallbackURL(): string {
	return new URL("/", globalThis.location.origin).toString();
}

export const apiClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			fetch(url, options) {
				return globalThis.fetch(url, { ...options, credentials: "include" });
			},
			url: `${serverUrl}/trpc`,
		}),
	],
});
