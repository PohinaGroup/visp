/** "3d 14h 02m" style label for how long the showcase channel has been live. */
export function onAirLabel(sinceIso: string | null, nowMs: number) {
	if (!sinceIso) return null;
	const seconds = Math.max(
		0,
		Math.floor((nowMs - Date.parse(sinceIso)) / 1000),
	);
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const pad = (n: number) => String(n).padStart(2, "0");
	return days > 0
		? `${days}d ${pad(hours)}h ${pad(minutes)}m`
		: `${pad(hours)}h ${pad(minutes)}m ${pad(seconds % 60)}s`;
}

/** Which of `count` items is showing, rotating every `periodMs`. */
export function rotationIndex(nowMs: number, count: number, periodMs: number) {
	return count > 0 ? Math.floor(nowMs / periodMs) % count : 0;
}
