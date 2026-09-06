/** Fire-and-forget server-side custom event for the portal activation funnel. */
export function trackRybbitEvent(
	eventName: string,
	properties: Record<string, unknown>,
	pathname = "/api/server",
) {
	const endpoint = process.env.RYBBIT_ENDPOINT;
	const siteId = process.env.RYBBIT_SITE_ID;
	const hostname = process.env.RYBBIT_HOSTNAME;
	if (!endpoint || !siteId || !hostname) return;
	void fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			site_id: siteId,
			hostname,
			type: "custom_event",
			event_name: eventName,
			pathname,
			properties: JSON.stringify(properties),
		}),
	}).catch(() => {
		// analytics must never break the relay path
	});
}
