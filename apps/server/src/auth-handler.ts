import { auth } from "@VISP/auth";

/** Keep installed 1.6 mobile clients and the registered Kick callback working. */
export async function handleAuthRequest(request: Request) {
	const url = new URL(request.url);
	if (url.pathname === "/api/auth/oauth2/callback/kick") {
		url.pathname = "/api/auth/callback/kick";
		return auth.handler(new Request(url.href, request));
	}
	const legacyOAuth = url.pathname === "/api/auth/sign-in/oauth2" || url.pathname === "/api/auth/oauth2/link";
	if (request.method !== "POST" || (!legacyOAuth && url.pathname !== "/api/auth/unlink-account")) return auth.handler(request);
	const body = await request.clone().json().catch(() => null);
	if (!body || typeof body !== "object" || !("providerId" in body) || typeof body.providerId !== "string") return auth.handler(request);
	let normalized: Record<string, unknown>;
	if (legacyOAuth) {
		url.pathname = url.pathname.endsWith("/link") ? "/api/auth/link-social" : "/api/auth/sign-in/social";
		const { providerId, ...rest } = body;
		normalized = { ...rest, provider: providerId };
	} else {
		const accounts = await auth.api.listUserAccounts({ headers: request.headers }).catch(() => null);
		const matches = accounts?.filter((account) => account.providerId === body.providerId);
		if (matches?.length !== 1 || !matches[0]) return Response.json({ message: "Linked account not found" }, { status: 400 });
		normalized = { accountId: matches[0].id };
	}
	const headers = new Headers(request.headers);
	headers.delete("content-length");
	return auth.handler(new Request(url.href, { method: "POST", headers, body: JSON.stringify(normalized) }));
}
