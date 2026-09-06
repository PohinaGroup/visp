import { describe, expect, test } from "bun:test";
import "../test-env";
import { normalizeChannelLogin } from "./sources";

describe("multichat channel names", () => {
	test("normalizes a public nickname and rejects unsafe input", () => {
		expect(normalizeChannelLogin(" @VISP.Stream ")).toBe("visp.stream");
		expect(() => normalizeChannelLogin("visp stream")).toThrow();
	});
});
