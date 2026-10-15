import { recordHostedUsage } from "@VISP/api/hosted-usage";
import { LANGUAGE_CODES } from "@VISP/api/languages";
import { entitlement, quotaUsedMessage } from "@VISP/api/plan";
import { fixedWindow } from "@VISP/api/rate-limit";
import {
	betterSubtitlesConfigured,
	createScribeToken,
	SUBTITLES_PROVIDER,
	SUBTITLES_TOKEN_SECONDS,
	SubtitlesError,
} from "@VISP/api/subtitles";
import { getUserSession } from "@VISP/auth";
import { Elysia } from "elysia";
import { z } from "zod";

/** A session needs at most a handful of tokens per stream start / reconnect. */
const TOKENS_PER_MINUTE = 10;

const subtitleTokens = fixedWindow(TOKENS_PER_MINUTE, 60_000);

const tokenSchema = z.object({
	language: z.enum(LANGUAGE_CODES),
});

export function resetSubtitlesRateLimit() {
	subtitleTokens.reset();
}

export const subtitlesRoutes = new Elysia({ name: "subtitles-routes" }).post(
	"/api/subtitles/token",
	async ({ request, status }) => {
		const session = await getUserSession(request.headers);
		if (!session) return status(401, { error: "Authentication required" });

		// Only starting is gated: a running caption socket goes to ElevenLabs
		// directly and is never cut off at quota zero.
		const access = await entitlement(session.user.id, "subtitles");
		if (!access.entitled) {
			return status(403, { error: "Better subtitles are part of Plus" });
		}
		if (!access.allowed) return status(403, { error: quotaUsedMessage() });

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return status(400, { error: "Invalid request" });
		}
		const parsed = tokenSchema.safeParse(body);
		if (!parsed.success) return status(400, { error: "Invalid request" });

		if (!subtitleTokens.take(session.user.id)) {
			return status(429, { error: "Too many requests" });
		}
		if (!betterSubtitlesConfigured()) {
			return status(503, { error: "Better subtitles are not configured" });
		}

		try {
			const token = await createScribeToken(parsed.data);
			// The audio never passes through VISP, so each token costs its first
			// minute up front and the app reports the rest (plan.reportSubtitles).
			// That keeps a crashed or modified client from minting for free.
			recordHostedUsage({
				userId: session.user.id,
				feature: "subtitles",
				units: SUBTITLES_TOKEN_SECONDS,
				unit: "seconds",
				provider: SUBTITLES_PROVIDER,
			});
			return Response.json(token, {
				headers: { "Cache-Control": "no-store" },
			});
		} catch (error) {
			if (error instanceof SubtitlesError) {
				return status(502, {
					error: "Better subtitles are unavailable right now",
				});
			}
			return status(502, {
				error: "Better subtitles are unavailable right now",
			});
		}
	},
	{ parse: "none" },
);
