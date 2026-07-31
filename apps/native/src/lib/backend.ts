import type { AppRouter } from "@VISP/api/routers/index";
import { expoClient } from "@better-auth/expo/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import {
	normalizeServerOrigin,
	authenticatedFetch as postAuthenticatedFetch,
	authenticatedPost as postAuthenticatedPost,
	sessionCookie as readSessionCookie,
} from "./server-api";

function resolveServerUrl(): string {
	const url = normalizeServerOrigin();
	if (!url) {
		throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");
	}
	return url;
}

const serverUrl = resolveServerUrl();

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	plugins: [
		expoClient({
			scheme: "visp",
			storage: SecureStore,
			storagePrefix: "visp",
		}),
		genericOAuthClient(),
	],
});

export function authCallbackURL(): string {
	return "/";
}

export function serverOrigin(): string {
	return serverUrl;
}

export function sessionCookie(): string | undefined {
	return readSessionCookie(authClient.getCookie);
}

export function authenticatedFetch(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	return postAuthenticatedFetch(serverUrl, path, init, sessionCookie());
}

export function authenticatedPost(
	path: string,
	body: unknown,
): Promise<Response> {
	return postAuthenticatedPost(serverUrl, path, body, sessionCookie());
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
