const ENDPOINT = "https://analytics.huikaton.online/api/track";
/** VISP Web (visp-stream.com), Rybbit site 2 — activation funnel lives here. */
const SITE_ID = "3d694b332f4f";

/** Fire-and-forget server-side custom event for the portal activation funnel. */
export function trackRybbitEvent(
	eventName: string,
	properties: Record<string, unknown>,
	pathname = "/api/server",
) {
	void fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			site_id: SITE_ID,
			hostname: "visp-stream.com",
			type: "custom_event",
			event_name: eventName,
			pathname,
			properties: JSON.stringify(properties),
		}),
	}).catch(() => {
		// analytics must never break the relay path
	});
}
