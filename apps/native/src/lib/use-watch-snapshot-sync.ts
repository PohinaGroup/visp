import { useEffect, useRef } from "react";
import VispSrtModule from "../../modules/visp-srt";
import { IS_IOS } from "./platform";
import { buildWatchSnapshot, type WatchSnapshot } from "./watch-snapshot";

type WatchSnapshotInput = Parameters<typeof buildWatchSnapshot>[0];

/**
 * Syncs the Apple Watch snapshot only when the payload changes. Without this,
 * OBS polling and other no-op state updates stringify and push over
 * WatchConnectivity on every tick.
 */
export function useWatchSnapshotSync({
	audioTier,
	configuration,
	liveStartedAt,
	message,
	messages,
	obs,
	reconnectAttempt,
	state,
	statuses,
	viewers,
}: WatchSnapshotInput) {
	const lastJsonRef = useRef("");

	useEffect(() => {
		if (!IS_IOS) return;
		const json = JSON.stringify(
			buildWatchSnapshot({
				audioTier,
				configuration,
				liveStartedAt,
				message,
				messages,
				obs,
				reconnectAttempt,
				state,
				statuses,
				viewers,
			}) satisfies WatchSnapshot,
		);
		if (json === lastJsonRef.current) {
			return;
		}
		lastJsonRef.current = json;
		VispSrtModule.syncWatchSnapshot(json);
	}, [
		audioTier,
		configuration,
		liveStartedAt,
		message,
		messages,
		obs,
		reconnectAttempt,
		state,
		statuses,
		viewers,
	]);
}
