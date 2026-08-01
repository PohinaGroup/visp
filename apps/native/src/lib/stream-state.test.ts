import { describe, expect, test } from "bun:test";
import type { StreamState } from "../../modules/visp-srt";
import { isPublishing, isStreamSession } from "./stream-state";

const STATES: StreamState[] = [
	"idle",
	"preparing",
	"connecting",
	"live",
	"reconnecting",
	"stopping",
	"error",
];

describe("stream phase helpers", () => {
	test("isPublishing is true only while the encoder is active", () => {
		for (const state of STATES) {
			expect(isPublishing(state)).toBe(
				state === "connecting" || state === "live" || state === "reconnecting",
			);
		}
	});

	test("isStreamSession includes stopping but speech should use isPublishing", () => {
		expect(isStreamSession("stopping")).toBe(true);
		expect(isPublishing("stopping")).toBe(false);
	});
});
