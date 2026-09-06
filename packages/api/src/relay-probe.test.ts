import { afterEach, expect, spyOn, test } from "bun:test";
import { fastestRelay, medianRoundTrip, probeRelayRtt } from "./relay-probe";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("probe discards setup, uses the median, and preserves query parameters", async () => {
	let clock = 0;
	let calls = 0;
	const now = spyOn(performance, "now").mockImplementation(() => clock);
	const durations = [900, 30, 10, 20];
	globalThis.fetch = (async (input, init) => {
		expect(new URL(String(input)).searchParams.get("region")).toBe("us");
		expect(init?.credentials).toBe("omit");
		clock += durations[calls++] ?? 0;
		return new Response(null, { status: 204 });
	}) as typeof fetch;
	try {
		expect(await probeRelayRtt("https://us.test/ping?region=us", 3)).toBe(20);
		expect(calls).toBe(4);
		expect(() => medianRoundTrip([])).toThrow();
	} finally {
		now.mockRestore();
	}
});

test("a stalled relay is aborted within the total probe budget", async () => {
	globalThis.fetch = ((_input, init) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () =>
				reject(new Error("aborted")),
			);
		})) as typeof fetch;
	await expect(
		probeRelayRtt("https://stalled.test/ping", 7, 10),
	).rejects.toThrow("aborted");
});

test("selection ignores failed relays and falls back when every relay fails", async () => {
	globalThis.fetch = (async (input) => {
		if (String(input).includes("bad"))
			return new Response(null, { status: 503 });
		return new Response(null, { status: 204 });
	}) as typeof fetch;
	const bad = { id: 1, pingUrl: "https://bad.test/ping" };
	const good = { id: 2, pingUrl: "https://good.test/ping" };
	const fastest = await fastestRelay([bad, good]);
	expect(fastest?.id).toBe(2);
	expect(await fastestRelay([bad])).toBeUndefined();
	expect(await fastestRelay([])).toBeUndefined();
});
