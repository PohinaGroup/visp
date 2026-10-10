import { describe, expect, test } from "bun:test";

import "./test-env";

const { createAudioUsageMeter, createAudioUsageMeters, pcmSeconds } =
	await import("./audio-usage");
type HostedUsageEvent = import("./hosted-usage").HostedUsageEvent;

const PCM_16K = { sampleRate: 16_000, channels: 1, bytesPerSample: 2 };

/** A clock the test moves by hand, and a recorder standing in for the buffer. */
const fakes = () => {
	let at = 1_000_000;
	const events: HostedUsageEvent[] = [];
	return {
		events,
		now: () => at,
		advance: (ms: number) => {
			at += ms;
		},
		record: (event: HostedUsageEvent) => void events.push(event),
		total: () => events.reduce((sum, event) => sum + event.units, 0),
	};
};

describe("pcmSeconds", () => {
	test("converts bytes at the codec's sample rate, channels and width", () => {
		expect(pcmSeconds(32_000, PCM_16K)).toBe(1);
		expect(pcmSeconds(6_400, PCM_16K)).toBeCloseTo(0.2);
		expect(pcmSeconds(32_000, { sampleRate: 16_000 })).toBe(1);
		expect(pcmSeconds(176_400, { sampleRate: 44_100, channels: 2 })).toBe(1);
		expect(pcmSeconds(48_000, { sampleRate: 48_000, bytesPerSample: 1 })).toBe(
			1,
		);
	});

	test("is zero for nothing or nonsense", () => {
		expect(pcmSeconds(0, PCM_16K)).toBe(0);
		expect(pcmSeconds(-10, PCM_16K)).toBe(0);
		expect(pcmSeconds(Number.NaN, PCM_16K)).toBe(0);
		expect(pcmSeconds(100, { sampleRate: 0 })).toBe(0);
	});
});

describe("createAudioUsageMeter", () => {
	test("accumulates fractions and records at most once per interval", () => {
		const clock = fakes();
		const meter = createAudioUsageMeter({
			userId: "u1",
			feature: "subtitles",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
		});

		// 0.2 s chunks every 200 ms, as the native apps send them.
		for (let i = 0; i < 49; i += 1) {
			clock.advance(200);
			meter.addBytes(6_400);
		}
		expect(clock.events).toHaveLength(0);
		expect(meter.pending()).toBeCloseTo(9.8);

		clock.advance(200);
		meter.addBytes(6_400);
		expect(clock.events).toHaveLength(1);
		expect(clock.events[0]).toEqual({
			userId: "u1",
			feature: "subtitles",
			units: expect.closeTo(10, 6),
			unit: "seconds",
			provider: "elevenlabs",
		});
		expect(meter.pending()).toBe(0);
	});

	test("counts audio sent, not wall clock", () => {
		const clock = fakes();
		const meter = createAudioUsageMeter({
			userId: "u1",
			feature: "subtitles",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
		});

		meter.addBytes(16_000);
		// A long pause (app backgrounded) bills nothing for the gap.
		clock.advance(5 * 60_000);
		meter.addBytes(16_000);
		meter.end();

		expect(clock.events).toHaveLength(1);
		expect(clock.total()).toBeCloseTo(1);
	});

	test("records the tail on end, once, and ignores audio after it", () => {
		const clock = fakes();
		const meter = createAudioUsageMeter({
			userId: "u1",
			feature: "audio_isolation",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
		});

		meter.addBytes(8_000);
		meter.end();
		meter.end();
		meter.addBytes(32_000);
		meter.end();

		expect(clock.events).toHaveLength(1);
		expect(clock.events[0]?.units).toBeCloseTo(0.25);
		expect(clock.events[0]?.feature).toBe("audio_isolation");
	});

	test("records nothing for a stream that sent no audio", () => {
		const clock = fakes();
		const meter = createAudioUsageMeter({
			userId: "u1",
			feature: "subtitles",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
		});

		meter.addBytes(0);
		meter.end();

		expect(clock.events).toHaveLength(0);
	});

	test("never lets a failing recorder reach the audio path", () => {
		const clock = fakes();
		const meter = createAudioUsageMeter({
			userId: "u1",
			feature: "subtitles",
			provider: "elevenlabs",
			format: PCM_16K,
			record: () => {
				throw new Error("boom");
			},
			now: clock.now,
		});
		const original = console.error;
		console.error = () => {};
		try {
			meter.addBytes(32_000);
			expect(() => meter.end()).not.toThrow();
		} finally {
			console.error = original;
		}
	});
});

describe("createAudioUsageMeters", () => {
	test("keeps one meter per user and ends it after the idle window", () => {
		const clock = fakes();
		const meters = createAudioUsageMeters({
			feature: "audio_isolation",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
			sweepEveryMs: 0,
		});

		meters.addBytes("u1", 32_000);
		meters.addBytes("u2", 16_000);
		clock.advance(500);
		meters.addBytes("u1", 16_000);
		expect(meters.size()).toBe(2);
		expect(clock.events).toHaveLength(0);

		// u2 idle for 10 s, u1 for 9.5 s: only u2's stream has ended.
		clock.advance(9_500);
		meters.sweep();
		expect(meters.size()).toBe(1);
		expect(clock.events).toEqual([
			expect.objectContaining({ userId: "u2", units: 0.5 }),
		]);

		clock.advance(500);
		meters.sweep();
		expect(meters.size()).toBe(0);
		expect(clock.events[1]).toEqual(
			expect.objectContaining({ userId: "u1", units: 1.5 }),
		);
	});

	test("a continuously streaming user is recorded every interval", () => {
		const clock = fakes();
		const meters = createAudioUsageMeters({
			feature: "audio_isolation",
			provider: "elevenlabs",
			format: PCM_16K,
			record: clock.record,
			now: clock.now,
			sweepEveryMs: 0,
		});

		// Two 0.5 s chunks per second for 30 s.
		for (let i = 0; i < 60; i += 1) {
			clock.advance(500);
			meters.addBytes("u1", 16_000);
			meters.sweep();
		}
		expect(clock.events.length).toBeGreaterThanOrEqual(2);
		expect(clock.events.length).toBeLessThanOrEqual(3);

		meters.endAll();
		expect(meters.size()).toBe(0);
		expect(clock.total()).toBeCloseTo(30);
	});
});
