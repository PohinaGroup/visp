import { describe, expect, test } from "bun:test";
import {
	lowLatencyPublishMs,
	STANDARD_PUBLISH_LATENCY_MS,
	withPublishLatency,
} from "./srt-latency";

describe("low-latency publish", () => {
	test("sizes SRT latency from the measured round trip", () => {
		expect(lowLatencyPublishMs(20, "wifi")).toBe(300);
		expect(lowLatencyPublishMs(120, "wifi")).toBe(500);
		expect(lowLatencyPublishMs(15, "wired")).toBe(120);
		expect(lowLatencyPublishMs(60, "cellular")).toBe(600);
	});

	test("falls back to a typical round trip when the probe failed", () => {
		expect(lowLatencyPublishMs(undefined, "wifi")).toBe(400);
		expect(lowLatencyPublishMs(Number.NaN, "cellular")).toBe(600);
	});

	test("never asks for more than the standard latency", () => {
		expect(lowLatencyPublishMs(900, "cellular")).toBe(
			STANDARD_PUBLISH_LATENCY_MS,
		);
	});

	test("sets latency on a publish URL without touching the stream ID", () => {
		const url =
			"srt://relay.test:8890?streamid=publish:s-1:creator:p%40ss&pkt_size=1316";
		expect(withPublishLatency(url, 300)).toBe(`${url}&latency=300`);
		expect(withPublishLatency(`${url}&latency=2000`, 450)).toBe(
			`${url}&latency=450`,
		);
		expect(withPublishLatency("srt://relay.test:8890", 300)).toBe(
			"srt://relay.test:8890?latency=300",
		);
		expect(
			withPublishLatency("srt://relay.test:8890?streamid=publish:a:b:c?d", 300),
		).toBe("srt://relay.test:8890?streamid=publish:a:b:c?d&latency=300");
	});

	test("rejects latencies the apps would ignore", () => {
		expect(() =>
			withPublishLatency("srt://relay.test:8890", 300_000),
		).toThrow();
		expect(() => withPublishLatency("srt://relay.test:8890", 5)).toThrow();
	});
});
