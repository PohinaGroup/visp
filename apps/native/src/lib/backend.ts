import type { AppRouter } from "@VISP/api/routers/index";
import {
	expoClient,
	getSetCookie,
	hasBetterAuthCookies,
	storageAdapter,
} from "@better-auth/expo/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createAuthClient } from "better-auth/react";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { authCookieFromCallback } from "./auth-callback";
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
	],
});

const authStorage = storageAdapter(SecureStore);

async function consumeAuthCallback(url: string): Promise<void> {
	const cookie = authCookieFromCallback(url, "visp");
	if (!cookie || !hasBetterAuthCookies(cookie, "better-auth")) return;

	const previous = await authStorage.getItem("visp_cookie") ?? undefined;
	await authStorage.setItem("visp_cookie", getSetCookie(cookie, previous));
	authClient.$store.notify("$sessionSignal");
}

// Android can report the auth browser as dismissed before Expo receives the
// deep link. Consume the callback independently so that race cannot drop the
// session cookie. getInitialURL also covers an OAuth return after a cold start.
Linking.addEventListener("url", ({ url }) => void consumeAuthCallback(url));
void Linking.getInitialURL().then((url) => {
	if (url) return consumeAuthCallback(url);
});

export function authCallbackURL(): string {
	return "/";
}

export function serverOrigin(): string {
	return serverUrl;
}

export function sessionCookie(): Promise<string | undefined> {
	return readSessionCookie(authClient.getCookie);
}

export async function authenticatedFetch(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	return postAuthenticatedFetch(serverUrl, path, init, await sessionCookie());
}

export async function authenticatedPost(
	path: string,
	body: unknown,
): Promise<Response> {
	return postAuthenticatedPost(serverUrl, path, body, await sessionCookie());
}

export const apiClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			async headers() {
				const cookie = await authClient.getCookie();
				return cookie ? { Cookie: cookie } : {};
			},
			url: `${serverUrl}/trpc`,
		}),
	],
});
