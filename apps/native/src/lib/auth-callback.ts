export function authCookieFromCallback(
	url: string,
	scheme: string,
): string | undefined {
	try {
		const callback = new URL(url);
		return callback.protocol === `${scheme}:`
			? (callback.searchParams.get("cookie") ?? undefined)
			: undefined;
	} catch {
		return undefined;
	}
}
