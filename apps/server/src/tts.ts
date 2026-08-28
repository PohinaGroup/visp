import { betterFeatures } from "@VISP/api/better-features";
import { LANGUAGE_CODES } from "@VISP/api/languages";
import { fixedWindow } from "@VISP/api/rate-limit";
import { betterTtsConfigured, synthesizeSpeech } from "@VISP/api/tts";
import { auth } from "@VISP/auth";
import { Elysia } from "elysia";
import { z } from "zod";

/**
 * The spend ceiling. Utterances are capped at MAX_TEXT_CHARACTERS, so requests
 * per minute is also a character budget: 60 x 240 is about 14k characters a
 * minute in the worst case. Raise only after looking at a real bill.
 */
const REQUESTS_PER_MINUTE = 60;
const MAX_TEXT_CHARACTERS = 240;

const ttsRequests = fixedWindow(REQUESTS_PER_MINUTE, 60_000);

const speechSchema = z.object({
	text: z.string().trim().min(1).max(MAX_TEXT_CHARACTERS),
	language: z.enum(LANGUAGE_CODES),
});

export function resetTtsRateLimit() {
	ttsRequests.reset();
}

export const ttsRoutes = new Elysia({ name: "tts-routes" }).post(
	"/api/tts",
	async ({ request, status }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return status(401, { error: "Authentication required" });

		// The client switch is an affordance; this is the gate.
		if (!(await betterFeatures(session.user.id)).betterTts) {
			return status(403, { error: "Hosted speech is not enabled" });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return status(400, { error: "Invalid request" });
		}
		const parsed = speechSchema.safeParse(body);
		if (!parsed.success) return status(400, { error: "Invalid request" });

		if (!ttsRequests.take(session.user.id)) {
			return status(429, { error: "Too many requests" });
		}
		if (!betterTtsConfigured()) {
			return status(503, { error: "Speech is not configured" });
		}

		try {
			const audio = await synthesizeSpeech(parsed.data);
			return new Response(audio, {
				headers: {
					"Content-Type": "audio/mpeg",
					"Cache-Control": "no-store",
				},
			});
		} catch {
			// Every failure here just means the app reads the message with the
			// device voice instead, so chat stays audible.
			return status(502, { error: "Speech is unavailable right now" });
		}
	},
	{ parse: "none" },
);
