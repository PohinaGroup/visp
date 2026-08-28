import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { eq } from "drizzle-orm";

/**
 * The only admission control the hosted providers have. Unlike Direct these
 * gate spend: every character, chunk, and minute billed is someone's live
 * stream. The on-device fallbacks (system voice, iOS isolation, on-device STT)
 * need no flag.
 *
 * All three live on one row, so they are fetched together rather than once per
 * feature.
 */
export async function betterFeatures(userId: string) {
	const [owner] = await db
		.select({
			betterTts: appUser.betterTts,
			betterAudioIsolation: appUser.betterAudioIsolation,
			betterSubtitles: appUser.betterSubtitles,
		})
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	// The columns are notNull, so a row that exists is already all-boolean.
	return (
		owner ?? {
			betterTts: false,
			betterAudioIsolation: false,
			betterSubtitles: false,
		}
	);
}
