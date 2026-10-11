import type { AppRouter } from "@VISP/api/routers/index";
import {
	expoClient,
	getSetCookie,
	hasBetterAuthCookies,
	storageAdapter,
} from "@better-auth/expo/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
import { getRandomBytesAsync } from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
	AUTH_STATE_BYTES,
	authStateFromBytes,
	bindAuthRequest,
	decideAuthCallback,
	isBrowserAuthRequest,
	PENDING_AUTH_CALLBACK_KEY,
	parsePendingAuthCallback,
	serializePendingAuthCallback,
} from "./auth-callback";
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

// Same resolution the expo plugin applies to app-relative callback URLs.
function absoluteCallbackURL(url: string): string {
	return url.startsWith("/") ? Linking.createURL(url) : url;
}

/**
 * Binds every browser sign-in / account link to a one-time state before the
 * request leaves the app. The state rides on the callback URL (the server
 * redirects to it verbatim and the expo plugin only appends `cookie`), and is
 * persisted so an OAuth return after an Android cold start can still be
 * matched. Listed after expoClient so its init sees absolute callback URLs.
 */
const authCallbackState = {
	id: "visp-auth-callback-state",
	fetchPlugins: [
		{
			id: "visp-auth-callback-state",
			name: "VISP auth callback state",
			async init(url, options) {
				const { pathname } = new URL(url, options?.baseURL);
				const body: unknown = options?.body;
				if (options && isBrowserAuthRequest(pathname, body)) {
					const state = authStateFromBytes(
						await getRandomBytesAsync(AUTH_STATE_BYTES),
					);
					const pending = bindAuthRequest(
						body,
						state,
						Date.now(),
						absoluteCallbackURL,
					);
					await SecureStore.setItemAsync(
						PENDING_AUTH_CALLBACK_KEY,
						serializePendingAuthCallback(pending),
					);
				}
				return { url, options };
			},
			hooks: {
				async onSuccess(context) {
					// iOS hands the callback straight to the auth session (which the
					// expo plugin has fully handled by now) and never to Linking, so
					// nothing else would consume the state. Android keeps it: the deep
					// link can arrive after the browser already reported dismissed.
					if (Platform.OS !== "ios" || !context.data?.redirect) return;
					const { pathname } = new URL(context.request.url);
					let body: unknown;
					try {
						body = JSON.parse(String(context.request.body));
					} catch {
						return;
					}
					if (isBrowserAuthRequest(pathname, body)) {
						await SecureStore.deleteItemAsync(PENDING_AUTH_CALLBACK_KEY);
					}
				},
			},
		},
	],
} satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
	baseURL: `${serverUrl}/api/auth`,
	plugins: [
		expoClient({
			scheme: "visp",
			storage: SecureStore,
			storagePrefix: "visp",
		}),
		authCallbackState,
	],
});

const authStorage = storageAdapter(SecureStore);

async function consumeAuthCallback(url: string): Promise<void> {
	const pending = parsePendingAuthCallback(
		await SecureStore.getItemAsync(PENDING_AUTH_CALLBACK_KEY),
	);
	const { consume, cookie } = decideAuthCallback(url, pending, Date.now());
	// Delete before touching the session so a state can never be used twice.
	if (consume) await SecureStore.deleteItemAsync(PENDING_AUTH_CALLBACK_KEY);
	if (!cookie || !hasBetterAuthCookies(cookie, "better-auth")) return;

	const previous = (await authStorage.getItem("visp_cookie")) ?? undefined;
	await authStorage.setItem("visp_cookie", getSetCookie(cookie, previous));
	authClient.$store.notify("$sessionSignal");
}

// The same link can arrive through both the event and getInitialURL; run
// callbacks one at a time so the single-use check cannot race itself.
let authCallbackQueue = Promise.resolve();
function handleAuthCallback(url: string): void {
	authCallbackQueue = authCallbackQueue
		.then(() => consumeAuthCallback(url))
		.catch(() => undefined);
}

// Android can report the auth browser as dismissed before Expo receives the
// deep link. Consume the callback independently so that race cannot drop the
// session cookie. getInitialURL also covers an OAuth return after a cold start.
// Only links carrying the state of a sign-in this app started are accepted.
Linking.addEventListener("url", ({ url }) => handleAuthCallback(url));
void Linking.getInitialURL().then((url) => {
	if (url) handleAuthCallback(url);
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
