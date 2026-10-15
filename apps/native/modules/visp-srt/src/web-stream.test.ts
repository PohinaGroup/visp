import { describe, expect, test } from "bun:test";
import {
	isAllowedRelayHost,
	sanitizedMediaError,
	stopMediaStream,
	webPublishTarget,
	webVideoFormats,
} from "./web-stream";

describe("web publisher helpers", () => {
	test("regional media follows the assigned host, not the build-time default", () => {
		const url = "srt://us.example.com:8890?streamid=publish:phone:user:secret";
		expect(webPublishTarget(url, "https://fi.example.com").whipUrl).toBe(
			"https://us.example.com/phone/whip",
		);
		expect(webPublishTarget(url, "https://us.example.com:9443").whipUrl).toBe(
			"https://us.example.com:9443/phone/whip",
		);
	});
	test("refuses relays outside the configured VISP relay domain", () => {
		const configured = "https://relay.visp-stream.com";
		const target = (host: string) =>
			webPublishTarget(
				`srt://${host}:8890?streamid=publish:phone:user:secret`,
				configured,
			);
		expect(target("relay-us.visp-stream.com").publisherScriptUrl).toBe(
			"https://relay-us.visp-stream.com/phone/publisher.js",
		);
		expect(() => target("attacker.example")).toThrow(
			"does not point to a VISP relay",
		);
		expect(() => target("visp-stream.com.attacker.example")).toThrow(
			"does not point to a VISP relay",
		);
		expect(() => target("evilvisp-stream.com")).toThrow(
			"does not point to a VISP relay",
		);
		expect(() =>
			webPublishTarget(
				"srt://relay.visp-stream.com:8890?streamid=publish:phone:user:secret",
			),
		).toThrow("not configured");
	});

	test("matches IP and single-label relays exactly", () => {
		expect(isAllowedRelayHost("10.0.0.2", "10.0.0.2")).toBe(true);
		expect(isAllowedRelayHost("1.0.0.2", "10.0.0.2")).toBe(false);
		expect(isAllowedRelayHost("a.example.com", "example.com")).toBe(false);
		expect(
			isAllowedRelayHost("RELAY.visp-stream.com", "relay.visp-stream.com"),
		).toBe(true);
	});

	test("maps SRT credentials to the MediaMTX publisher and WHIP URLs", () => {
		expect(
			webPublishTarget(
				"srt://relay.example.com:8890?streamid=publish:my-path:device:secret",
				"https://relay.example.com/",
			),
		).toEqual({
			password: "secret",
			publisherScriptUrl: "https://relay.example.com/my-path/publisher.js",
			user: "device",
			whipUrl: "https://relay.example.com/my-path/whip",
		});
	});

	test("only offers 1080p when browser track capabilities support it", () => {
		expect(webVideoFormats()).toHaveLength(1);
		expect(
			webVideoFormats({
				frameRate: { max: 30, min: 1 },
				height: { max: 1080, min: 1 },
				width: { max: 1920, min: 1 },
			} as MediaTrackCapabilities),
		).toHaveLength(2);
	});

	test("does not leak browser error details", () => {
		const result = sanitizedMediaError(new Error("secret camera name"));
		expect(result.message).not.toContain("secret camera name");
	});

	test("stops every media track during cleanup", () => {
		let stopped = 0;
		stopMediaStream({
			getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }],
		} as unknown as MediaStream);
		expect(stopped).toBe(2);
	});
});
