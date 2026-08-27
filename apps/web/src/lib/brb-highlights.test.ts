import { expect, test } from "bun:test";

import { brbRefetchInterval } from "./brb-highlights";

test("BRB highlights polling discovers holds and follows active holds closely", () => {
	expect(brbRefetchInterval(undefined)).toBe(false);
	expect(
		brbRefetchInterval({ active: false, highlights: { enabled: false } }),
	).toBe(false);
	expect(
		brbRefetchInterval({ active: false, highlights: { enabled: true } }),
	).toBe(5000);
	expect(
		brbRefetchInterval({ active: true, highlights: { enabled: true } }),
	).toBe(1000);
});
