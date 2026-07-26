import type { AppRouter } from "@VISP/api/routers/index";
import { adminAccess, adminRoles } from "@VISP/auth/permissions";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { adminClient, genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const serverUrl = (
	import.meta.env.VITE_SERVER_URL || "https://api.visp.localhost"
).replace(/\/$/, "");

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	fetchOptions: { credentials: "include" },
	plugins: [
		adminClient({ ac: adminAccess, roles: adminRoles }),
		genericOAuthClient(),
	],
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
