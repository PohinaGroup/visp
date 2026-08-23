const SITE_ID = "ee5aa00a47dd";

declare global {
	interface Window {
		rybbit?: { event: (name: string, props?: Record<string, unknown>) => void };
	}
}

// ponytail: the script tracks pageviews (incl. SPA history changes) and records
// replay on its own, so there is nothing to send by hand except custom events.
if (typeof document !== "undefined" && !document.getElementById("rybbit")) {
	const script = document.createElement("script");
	script.id = "rybbit";
	script.src = "https://analytics.huikaton.online/api/script.js";
	script.async = true;
	script.dataset.siteId = SITE_ID;
	// Keep stream keys and publish URLs out of replay, same rules as apps/web.
	script.dataset.replayBlockSelector = ".rr-block, [data-rybbit-block]";
	script.dataset.replayMaskTextSelectors = '["[data-pii]"]';
	script.dataset.replayMaskAllInputs = "true";
	document.head.appendChild(script);
}

export function trackPageview(_pathname: string, _pageTitle?: string) {
	// handled by the script
}

export function trackEvent(
	eventName: string,
	_pathname: string,
	properties?: Record<string, unknown>,
) {
	window.rybbit?.event(eventName, properties);
}
