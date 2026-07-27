import Constants from "expo-constants";
import { Dimensions, Platform } from "react-native";

const ENDPOINT = "https://analytics.huikaton.online/api/track";
const SITE_ID = "fd74fffba3ed";
const HOSTNAME = "remote.visp-stream.com";

// Web goes through analytics.web.ts (script.js); this file is the native path,
// where there is no browser to run the script.
const version = Constants.expoConfig?.version ?? "dev";
const userAgent = `VISP-OBS-Remote/${version} (${Platform.OS} ${Platform.Version})`;

type Payload = {
	type: "pageview" | "custom_event";
	pathname: string;
	page_title?: string;
	event_name?: string;
	properties?: string;
};

async function send(payload: Payload) {
	const { width, height } = Dimensions.get("window");
	try {
		await fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				site_id: SITE_ID,
				hostname: HOSTNAME,
				user_agent: userAgent,
				screenWidth: Math.round(width),
				screenHeight: Math.round(height),
				...payload,
			}),
		});
	} catch {
		// analytics must never break the app
	}
}

export function trackPageview(pathname: string, pageTitle?: string) {
	send({ type: "pageview", pathname, page_title: pageTitle });
}

export function trackEvent(
	eventName: string,
	pathname: string,
	properties?: Record<string, unknown>,
) {
	send({
		type: "custom_event",
		pathname,
		event_name: eventName,
		properties: properties ? JSON.stringify(properties) : undefined,
	});
}
