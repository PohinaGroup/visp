const ENDPOINT = "https://analytics.huikaton.online/api/track";
/** VISP Web (visp-stream.com), Rybbit site 2 — activation funnel lives here. */
const PORTAL_SITE_ID = "3d694b332f4f";
const PORTAL_HOSTNAME = "visp-stream.com";

/** Server-side twin: packages/api/src/rybbit.ts */
export function trackActivationEvent(
	eventName: string,
	properties: Record<string, unknown>,
	pathname = "/native/activation",
) {
	void fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			site_id: PORTAL_SITE_ID,
			hostname: PORTAL_HOSTNAME,
			type: "custom_event",
			event_name: eventName,
			pathname,
			properties: JSON.stringify(properties),
		}),
	}).catch(() => {
		// analytics must never break the app
	});
}
