import type { AppRouter } from "@VISP/api/routers/index";
import { expoClient } from "@better-auth/expo/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

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
		location: "apps/obs-remote/src/lib/backend.ts:init",
		message: "native backend init",
		data: { serverUrl, authBaseURL: `${serverUrl}/api/auth`, scheme: "obsremote" },
		timestamp: Date.now(),
	}),
}).catch(() => {});
// #endregion

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	plugins: [
		expoClient({
			scheme: "obsremote",
			storage: SecureStore,
			storagePrefix: "obsremote",
		}),
		genericOAuthClient(),
	],
});

export function authCallbackURL(): string {
	return "/";
}

export const apiClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			headers() {
				const cookie = authClient.getCookie();
				return cookie ? { Cookie: cookie } : {};
			},
			url: `${serverUrl}/trpc`,
		}),
	],
});
