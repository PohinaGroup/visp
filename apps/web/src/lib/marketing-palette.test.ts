import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { contrastRatio, MARKETING_PALETTE } from "./marketing-palette";

test("contrastRatio matches the WCAG reference values", () => {
	expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
	expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
});

for (const mode of ["light", "dark"] as const) {
	const p = MARKETING_PALETTE[mode];

	test(`${mode}: text pairs meet AA`, () => {
		for (const bg of [p.paper, p.surface]) {
			expect(contrastRatio(p.ink, bg)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(p.inkMuted, bg)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test(`${mode}: index.css carries the same hexes`, () => {
		const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
		for (const hex of Object.values(p)) {
			expect(css.toLowerCase()).toContain(hex.toLowerCase());
		}
	});
}
