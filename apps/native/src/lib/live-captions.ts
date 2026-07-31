import type { VispSrtViewRef } from "../../modules/visp-srt";
import { authenticatedPost } from "./backend";
import type { SpokenCaptionLanguage } from "./speech-preferences";
import { toSpokenLocale } from "./spoken-language";

export type LiveCaptionsResult = "started" | "failed" | "cancelled";

/**
 * Starts burned-in live captions on the native stream view. Better mode asks
 * our server for a single-use Scribe token so the ElevenLabs key stays server-side.
 *
 * Callers own session identity via `isCurrent`: bump a generation counter on
 * stop/retoggle so a stale token fetch cannot start the wrong language.
 */
export async function startLiveCaptions(
	view: VispSrtViewRef | null | undefined,
	language: SpokenCaptionLanguage,
	better: boolean,
	isCurrent: () => boolean,
): Promise<LiveCaptionsResult> {
	if (!view) return "cancelled";
	await stopLiveCaptions(view);
	if (!isCurrent()) return "cancelled";

	let wsUrl: string | undefined;
	if (better) {
		wsUrl = await fetchScribeWsUrl(language);
		if (!isCurrent()) return "cancelled";
		if (!wsUrl) return "failed";
	}

	try {
		await view.startLiveCaptions(toSpokenLocale(language), better, wsUrl);
	} catch {
		return "failed";
	}
	if (!isCurrent()) {
		await stopLiveCaptions(view);
		return "cancelled";
	}
	return "started";
}

export async function stopLiveCaptions(
	view: VispSrtViewRef | null | undefined,
) {
	if (!view) return;
	await view.stopLiveCaptions().catch(() => undefined);
	await view.clearCaptionsOverlay().catch(() => undefined);
}

async function fetchScribeWsUrl(language: SpokenCaptionLanguage) {
	const response = await authenticatedPost("/api/subtitles/token", {
		language,
	});
	if (!response.ok) return undefined;
	const body = (await response.json()) as { wsUrl?: unknown };
	return typeof body.wsUrl === "string" ? body.wsUrl : undefined;
}
