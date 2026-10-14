declare global {
	interface Window {
		rybbit?: { event: (name: string, props?: Record<string, unknown>) => void };
	}
}

// Routes that carry a secret in the URL: the overlay token (?t=) and the
// OBS pairing code. Analytics never loads on them.
const ANALYTICS_EXCLUDED_PATHS = new Set(["/overlay", "/device"]);

export function analyticsAllowed(pathname: string | undefined) {
	if (!pathname) return true;
	const normalized =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	return !ANALYTICS_EXCLUDED_PATHS.has(normalized);
}

export function trackEvent(
	eventName: string,
	properties?: Record<string, unknown>,
) {
	window.rybbit?.event(eventName, properties);
}

/** Fire at most once per browser tab session (activation funnel steps). */
export function trackOnce(key: string, fn: () => void) {
	if (typeof sessionStorage === "undefined") return;
	const storageKey = `rybbit-once:${key}`;
	if (sessionStorage.getItem(storageKey)) return;
	sessionStorage.setItem(storageKey, "1");
	fn();
}
