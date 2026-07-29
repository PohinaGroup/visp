import Constants from "expo-constants";

const DEBUG_SESSION_ID = "ded1be";
const DEBUG_INGEST_PATH =
	"/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c";

export function debugIngestHost(): string {
	const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;
	if (serverUrl) {
		try {
			return new URL(serverUrl).hostname;
		} catch {
			// fall through
		}
	}
	return Constants.expoConfig?.hostUri?.split(":")[0] ?? "127.0.0.1";
}

function debugEndpoint(): string {
	return `http://${debugIngestHost()}:7870${DEBUG_INGEST_PATH}`;
}

export function redactStreamUrl(url: string): Record<string, string | undefined> {
	try {
		const parsed = new URL(url);
		const streamId = parsed.searchParams.get("streamid");
		const parts = streamId?.split(":") ?? [];
		return {
			host: parsed.hostname,
			port: parsed.port,
			scheme: parsed.protocol.replace(":", ""),
			streamIdPrefix:
				parts.length >= 3
					? `${parts[0]}:${parts[1]}:${parts[2]}:***`
					: streamId?.slice(0, 24),
		};
	} catch {
		return { host: "invalid-url" };
	}
}

export function debugLog(
	location: string,
	message: string,
	data: Record<string, unknown> = {},
	hypothesisId?: string,
): void {
	// #region agent log
	fetch(debugEndpoint(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Debug-Session-Id": DEBUG_SESSION_ID,
		},
		body: JSON.stringify({
			sessionId: DEBUG_SESSION_ID,
			location,
			message,
			data,
			timestamp: Date.now(),
			...(hypothesisId ? { hypothesisId } : {}),
		}),
	}).catch(() => {});
	// #endregion
}
