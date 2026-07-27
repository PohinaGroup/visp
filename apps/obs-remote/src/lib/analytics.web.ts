const SITE_ID = "fd74fffba3ed";

declare global {
	interface Window {
		rybbit?: { event: (name: string, props?: Record<string, unknown>) => void };
	}
}

// The script tracks pageviews (incl. SPA history changes) on its own, so there
// is nothing to send by hand except custom events.
if (typeof document !== "undefined" && !document.getElementById("rybbit")) {
	const script = document.createElement("script");
	script.id = "rybbit";
	script.src = "https://analytics.huikaton.online/api/script.js";
	script.async = true;
	script.dataset.siteId = SITE_ID;
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
