// Client-safe: shared by the portal and the native/browser broadcaster.
export function medianRoundTrip(samples: number[]) {
	if (samples.length === 0)
		throw new Error("At least one RTT sample is required");
	const sorted = [...samples].sort((a, b) => a - b);
	return Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0);
}

export async function probeRelayRtt(
	url: string,
	sampleCount = 7,
	timeoutMs = 3000,
) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const samples: number[] = [];
		for (let index = 0; index <= sampleCount; index += 1) {
			const target = new URL(url);
			target.searchParams.set("sample", `${Date.now()}-${index}`);
			const startedAt = performance.now();
			const response = await fetch(target.toString(), {
				cache: "no-store",
				credentials: "omit",
				signal: controller.signal,
			});
			if (!response.ok)
				throw new Error(`Relay probe failed with ${response.status}`);
			await response.text();
			// Discard connection setup; rank established connections.
			if (index > 0) samples.push(performance.now() - startedAt);
		}
		return medianRoundTrip(samples);
	} finally {
		clearTimeout(timeout);
	}
}

export async function fastestRelay(relays: { id: number; pingUrl: string }[]) {
	const probes = await Promise.allSettled(
		relays.map(async (relay) => ({
			id: relay.id,
			rtt: await probeRelayRtt(relay.pingUrl),
		})),
	);
	return probes
		.flatMap((probe) => (probe.status === "fulfilled" ? [probe.value] : []))
		.sort((a, b) => a.rtt - b.rtt || a.id - b.id)[0];
}
