import { describe, expect, test } from "bun:test";
import { isBanActive } from "./ban";

describe("isBanActive", () => {
	test("is active for a ban without expiry or with a future one", () => {
		expect(isBanActive({ banned: true })).toBe(true);
		expect(isBanActive({ banned: true, banExpires: null })).toBe(true);
		expect(
			isBanActive({ banned: true, banExpires: new Date(Date.now() + 60_000) }),
		).toBe(true);
		// The cached session copy carries the expiry as an ISO string.
		expect(
			isBanActive({
				banned: true,
				banExpires: new Date(Date.now() + 60_000).toISOString(),
			}),
		).toBe(true);
	});

	test("treats an expired ban or no ban as lifted", () => {
		expect(
			isBanActive({ banned: true, banExpires: new Date(Date.now() - 1) }),
		).toBe(false);
		expect(isBanActive({ banned: false })).toBe(false);
		expect(isBanActive({ banned: null })).toBe(false);
		expect(isBanActive({})).toBe(false);
	});
});
