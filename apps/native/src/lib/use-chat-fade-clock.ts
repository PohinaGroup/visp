import { useEffect, useState } from "react";
import { FADE_WINDOW_MS } from "./chat-model";

/** Ticks while chat messages are fading out. Keep in a leaf component so the stream screen does not re-render 4x/s. */
export function useChatFadeClock(
	active: boolean,
	disappearingMessages: boolean,
	newestReceivedAt: number,
) {
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		if (!active || !disappearingMessages || !newestReceivedAt) return;
		setNow(Date.now());
		const timer = setInterval(() => {
			const tick = Date.now();
			setNow(tick);
			if (tick - newestReceivedAt >= FADE_WINDOW_MS) clearInterval(timer);
		}, 250);
		return () => clearInterval(timer);
	}, [active, disappearingMessages, newestReceivedAt]);

	return now;
}
