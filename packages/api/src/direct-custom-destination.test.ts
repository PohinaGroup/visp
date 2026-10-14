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
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"[::ffff:7f00:1]",
		"0:0:0:0:0:ffff:7f00:1",
		"0000:0000:0000:0000:0000:FFFF:0A00:0001",
		"::ffff:a9fe:a9fe",
		"::7f00:1",
		"::127.0.0.1",
		"::ffff:0:7f00:1",
		"64:ff9b::7f00:1",
		"64:ff9b::10.0.0.1",
		"64:ff9b:1::1",
		"2002:7f00:1::1",
		"2002:c0a8:1::1",
		"fd12:3456::1",
		"fe80::1%eth0",
		"febf::1",
		"fec0::1",
		"::0.0.0.2",
	])("rejects non-public address %s", (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});

	test.each([
		"1.1.1.1",
		"2606:4700:4700::1111",
		"::ffff:1.1.1.1",
		"::ffff:101:101",
		"64:ff9b::101:101",
		"2002:101:101::1",
	])("accepts public address %s", (address) => {
		expect(isPublicAddress(address)).toBe(true);
	});

	test.each([
		"rtmp://[::ffff:7f00:1]/live/key",
		"rtmp://[::ffff:127.0.0.1]/live/key",
		"rtmp://[0:0:0:0:0:ffff:7f00:1]/live/key",
		"srt://[64:ff9b::a00:1]:9000?streamid=publish:key",
	])("rejects literal IPv4-in-IPv6 URL %s", async (url) => {
		await expect(
			validateCustomDestinationForStorage(url, publicDns),
		).rejects.toThrow("Destination URL is not valid");
	});

	test("rejects a hostname resolving to a mapped private address", async () => {
		await expect(
			validateCustomDestinationForStorage(
				"rtmp://example.com/live/key",
				async () => ["::ffff:7f00:1"],
			),
		).rejects.toThrow("Destination URL is not valid");
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
