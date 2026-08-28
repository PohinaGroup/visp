import { describe, expect, test } from "bun:test";

import {
	isPublicAddress,
	validateCustomDestinationForStorage,
} from "./direct-custom-destination";

const publicDns = async () => ["1.1.1.1"];

describe("custom Direct destination policy", () => {
	test.each([
		[
			"rtmp://ingest.example.com/live/key?token=secret",
			"rtmp",
			"rtmp://ingest.example.com",
		],
		[
			"rtmps://ingest.example.com:443/app/key",
			"rtmps",
			"rtmps://ingest.example.com:443",
		],
		[
			"srt://ingest.example.com:9000?streamid=publish:key&latency=120",
			"srt",
			"srt://ingest.example.com:9000",
		],
	] as const)(
		"accepts %s without exposing its path or query",
		async (url, protocol, summary) => {
			expect(await validateCustomDestinationForStorage(url, publicDns)).toEqual(
				{
					protocol,
					endpointSummary: summary,
				},
			);
		},
	);

	test.each([
		"http://ingest.example.com/live/key",
		"rtmp://user:secret@ingest.example.com/live/key",
		"rtmps://ingest.example.com/live/key#secret",
		"rtmp://ingest.example.com/",
		"srt://ingest.example.com?streamid=publish:key",
		"srt://ingest.example.com:9000",
		"rtmp://ingest.example.com/live/%0Akey",
	])("rejects unsafe or incomplete URL %s generically", async (url) => {
		await expect(
			validateCustomDestinationForStorage(url, publicDns),
		).rejects.toThrow("Destination URL is not valid");
		try {
			await validateCustomDestinationForStorage(url, publicDns);
		} catch (error) {
			expect(String(error)).not.toContain(url);
		}
	});

	test.each([
		"0.0.0.0",
		"10.0.0.1",
		"127.0.0.1",
		"169.254.1.1",
		"172.16.0.1",
		"192.168.0.1",
		"198.51.100.1",
		"203.0.113.1",
		"224.0.0.1",
		"::",
		"::1",
		"fc00::1",
		"fe80::1",
		"ff02::1",
		"2001:db8::1",
	])("rejects non-public address %s", (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});

	test("rejects a hostname when any resolved address is private", async () => {
		await expect(
			validateCustomDestinationForStorage(
				"rtmp://example.com/live/key",
				async () => ["1.1.1.1", "10.0.0.2"],
			),
		).rejects.toThrow("Destination URL is not valid");
	});
});
