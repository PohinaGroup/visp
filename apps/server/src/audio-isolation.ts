import {
	betterAudioIsolationConfigured,
	ISOLATION_MAX_BYTES,
	isolateAudioChunk,
} from "@VISP/api/audio-isolation";
import { betterFeatures } from "@VISP/api/better-features";
import { fixedWindow } from "@VISP/api/rate-limit";
import { auth } from "@VISP/auth";
import { Elysia } from "elysia";

/**
 * At 16 kHz mono s16le, 32 KB is one second of audio. Two chunks per second is
 * a reasonable ceiling for a phone uplink while keeping latency tolerable.
 */
const CHUNKS_PER_MINUTE = 120;

const isolationRequests = fixedWindow(CHUNKS_PER_MINUTE, 60_000);

export function resetAudioIsolationRateLimit() {
	isolationRequests.reset();
}

export const audioIsolationRoutes = new Elysia({
	name: "audio-isolation-routes",
}).post(
	"/api/audio-isolation",
	async ({ request, status }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return status(401, { error: "Authentication required" });

		if (!(await betterFeatures(session.user.id)).betterAudioIsolation) {
			return status(403, { error: "Better audio isolation is not enabled" });
		}

		if (!isolationRequests.take(session.user.id)) {
			return status(429, { error: "Too many requests" });
		}
		if (!betterAudioIsolationConfigured()) {
			return status(503, { error: "Better audio isolation is not configured" });
		}

		const contentType = request.headers.get("content-type") ?? "";
		if (!contentType.includes("application/octet-stream")) {
			return status(400, { error: "Invalid request" });
		}

		const audio = await request.arrayBuffer();
		if (audio.byteLength === 0 || audio.byteLength > ISOLATION_MAX_BYTES) {
			return status(400, { error: "Invalid request" });
		}

		try {
			const isolated = await isolateAudioChunk(audio);
			return new Response(isolated, {
				headers: {
					"Content-Type": "application/octet-stream",
					"Cache-Control": "no-store",
				},
			});
		} catch {
			// Never repeat what the provider said: it names accounts and quotas.
			return status(502, { error: "Audio isolation is unavailable right now" });
		}
	},
	{ parse: "none" },
);
