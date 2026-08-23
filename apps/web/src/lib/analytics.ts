declare global {
	interface Window {
		rybbit?: { event: (name: string, props?: Record<string, unknown>) => void };
	}
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
