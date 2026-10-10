import { describe, expect, test } from "bun:test";

import {
	formatDeviceCode,
	isDeviceCode,
	normalizeDeviceCode,
} from "./device-code";

describe("OBS pairing code", () => {
	test("normalises case, dashes and spaces like Better Auth", () => {
		expect(normalizeDeviceCode(" abcd-efgh ")).toBe("ABCDEFGH");
		expect(normalizeDeviceCode("ab cd\tef–gh")).toBe("ABCDEFGH");
		expect(formatDeviceCode("ABCDEFGH")).toBe("ABCD-EFGH");
	});

	test("accepts only the eight-character device alphabet", () => {
		expect(isDeviceCode("ABCD2345")).toBe(true);
		expect(isDeviceCode("ABCD234")).toBe(false);
		expect(isDeviceCode("ABCD23456")).toBe(false);
		expect(isDeviceCode("ABCD0123")).toBe(false);
		expect(isDeviceCode("ABCDEFGO")).toBe(false);
		expect(isDeviceCode("")).toBe(false);
	});
});
