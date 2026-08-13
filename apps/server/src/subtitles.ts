import { betterFeatures } from "@VISP/api/better-features";
import { LANGUAGE_CODES } from "@VISP/api/languages";
import { fixedWindow } from "@VISP/api/rate-limit";
import {
	betterSubtitlesConfigured,
	createScribeToken,
	SubtitlesError,
} from "@VISP/api/subtitles";
import { auth } from "@VISP/auth";
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
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return status(401, { error: "Authentication required" });

		if (!(await betterFeatures(session.user.id)).betterSubtitles) {
			return status(403, { error: "Better subtitles are not enabled" });
		}

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
