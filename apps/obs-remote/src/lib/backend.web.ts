import type { AppRouter } from "@VISP/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL?.replace(/\/$/, "");

if (!serverUrl) throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");

// #region agent log
fetch("http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		"X-Debug-Session-Id": "c83a20",
	},
	body: JSON.stringify({
		sessionId: "c83a20",
		runId: "post-fix",
		hypothesisId: "H2",
		location: "apps/obs-remote/src/lib/backend.web.ts:init",
		message: "web backend init",
		data: {
			serverUrl,
			authBaseURL: `${serverUrl}/api/auth`,
			locationOrigin:
				typeof globalThis.location !== "undefined"
					? globalThis.location.origin
					: null,
		},
		timestamp: Date.now(),
	}),
}).catch(() => {});
// #endregion

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
