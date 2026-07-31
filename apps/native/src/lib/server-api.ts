/** Normalized API origin without a trailing slash. */
export function normalizeServerOrigin(
	value = process.env.EXPO_PUBLIC_SERVER_URL,
): string | undefined {
	return value?.replace(/\/$/, "");
}

export function sessionCookie(
	getCookie: (() => string | undefined) | undefined,
): string | undefined {
	return typeof getCookie === "function" ? getCookie() : undefined;
}

export function authenticatedFetch(
	origin: string,
	path: string,
	init: RequestInit,
	cookie?: string,
): Promise<Response> {
	const headers = new Headers(init.headers);
	if (cookie) headers.set("Cookie", cookie);
	return fetch(`${origin}${path}`, {
		...init,
		credentials: "include",
		headers,
	});
}

export function authenticatedPost(
	origin: string,
	path: string,
	body: unknown,
	cookie?: string,
): Promise<Response> {
	return authenticatedFetch(
		origin,
		path,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		cookie,
	);
}
