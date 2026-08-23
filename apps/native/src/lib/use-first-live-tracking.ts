import type { DirectProvider } from "@VISP/api/direct";
import { useEffect, useRef } from "react";
import type { DirectPath } from "../components/stream-settings-direct-section";
import { apiClient } from "./backend";
import {
	FIRST_LIVE_POLL_MS,
	firstLiveProvidersToTrack,
} from "./first-live-tracking";

function trackFirstLiveProviders(
	pathId: number,
	providers: readonly DirectProvider[],
) {
	for (const provider of providers) {
		void apiClient.direct.trackFirstLive
			.mutate({ pathId, provider })
			.catch(() => undefined);
	}
}

/**
 * Native Go Live does not run the portal setup UI, and relay-side server
 * analytics can miss the activation funnel. Poll Direct state while streaming
 * and ask the API to emit first_live via the portal tracker (Rybbit site 2).
 */
export function useFirstLiveTracking(
	active: boolean,
	pathId: number | undefined,
	directPath: DirectPath | undefined,
	refreshDirectOutputs: () => Promise<void>,
) {
	const tracked = useRef(new Set<DirectProvider>());

	useEffect(() => {
		if (!active) {
			tracked.current.clear();
		}
	}, [active]);

	useEffect(() => {
		if (!active || !pathId) return;
		const pending = firstLiveProvidersToTrack(directPath, tracked.current);
		if (pending.length > 0) {
			for (const provider of pending) tracked.current.add(provider);
			trackFirstLiveProviders(pathId, pending);
		}
	}, [active, directPath, pathId]);

	useEffect(() => {
		if (!active) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = async () => {
			await refreshDirectOutputs().catch(() => undefined);
			if (!disposed) timer = setTimeout(() => void poll(), FIRST_LIVE_POLL_MS);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [active, refreshDirectOutputs]);
}
