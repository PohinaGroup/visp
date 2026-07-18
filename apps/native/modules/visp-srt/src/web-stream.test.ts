import { describe, expect, test } from "bun:test";
import {
	sanitizedMediaError,
	stopMediaStream,
	webPublishTarget,
	webVideoFormats,
} from "./web-stream";

describe("web publisher helpers", () => {
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
