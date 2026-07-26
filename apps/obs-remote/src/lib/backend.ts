import type { AppRouter } from "@VISP/api/routers/index";
import { expoClient } from "@better-auth/expo/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL?.replace(/\/$/, "");

if (!serverUrl) throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");

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
