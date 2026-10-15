import {
	betterAudioIsolationConfigured,
	ISOLATION_MAX_BYTES,
	isolateAudioChunk,
} from "@VISP/api/audio-isolation";
import { entitlement, quotaUsedMessage } from "@VISP/api/plan";
import { fixedWindow } from "@VISP/api/rate-limit";
import { getUserSession } from "@VISP/auth";
import { Elysia } from "elysia";
import { readBodyWithLimit } from "./body-limit";

/**
 * At 16 kHz mono s16le, 32 KB is one second of audio. Two chunks per second is
 * a reasonable ceiling for a phone uplink while keeping latency tolerable.
 */
const CHUNKS_PER_MINUTE = 120;

const isolationRequests = fixedWindow(CHUNKS_PER_MINUTE, 60_000);

/**
 * Chunks arriving within this long of the last accepted one are the same
 * running session. Quota zero only refuses a new session, so a live mic is
 * never cut off mid-stream; this also spares a database read per chunk.
 */
const RUNNING_SESSION_GAP_MS = 60_000;
// ponytail: per process; a session that moves between processes is
// re-checked once, which at worst refuses it a little early.
const lastAccepted = new Map<string, number>();

export function resetAudioIsolationRateLimit() {
	isolationRequests.reset();
	lastAccepted.clear();
}

export const audioIsolationRoutes = new Elysia({
	name: "audio-isolation-routes",
}).post(
	"/api/audio-isolation",
	async ({ request, status }) => {
		const session = await getUserSession(request.headers);
		if (!session) return status(401, { error: "Authentication required" });

		const now = Date.now();
		const previous = lastAccepted.get(session.user.id);
		if (previous === undefined || now - previous > RUNNING_SESSION_GAP_MS) {
			const access = await entitlement(session.user.id, "audio_isolation");
			if (!access.entitled) {
				return status(403, { error: "Better audio isolation is part of Plus" });
			}
			if (!access.allowed) return status(403, { error: quotaUsedMessage() });
		}
		lastAccepted.set(session.user.id, now);

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

		const body = await readBodyWithLimit(request, ISOLATION_MAX_BYTES);
		if (!body) return status(413, { error: "Audio chunk too large" });
		if (body.byteLength === 0) return status(400, { error: "Invalid request" });
		const audio = body.buffer as ArrayBuffer;

		try {
			const isolated = await isolateAudioChunk(audio, session.user.id);
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
