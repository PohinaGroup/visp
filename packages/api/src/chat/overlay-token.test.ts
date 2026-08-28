import "../test-env";

import { describe, expect, test } from "bun:test";
import { parseChatOverlayToken } from "./overlay-token";

describe("chat overlay token", () => {
	test("accepts only the bare id.secret shape", () => {
		const id = "a".repeat(24);
		const secret = "b".repeat(64);
		expect(parseChatOverlayToken(`${id}.${secret}`)).toEqual({ id, secret });
		// Unlike the OBS control token, no Bearer prefix: it arrives in a POST body.
		expect(parseChatOverlayToken(`Bearer ${id}.${secret}`)).toBeNull();
		expect(parseChatOverlayToken(`${id}.${secret}.extra`)).toBeNull();
		expect(parseChatOverlayToken(`${id}.${"b".repeat(63)}`)).toBeNull();
		expect(parseChatOverlayToken(`${"A".repeat(24)}.${secret}`)).toBeNull();
		expect(parseChatOverlayToken("../bad")).toBeNull();
		expect(parseChatOverlayToken("")).toBeNull();
		expect(parseChatOverlayToken(undefined)).toBeNull();
	});
});
