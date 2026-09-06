import { describe, expect, test } from "bun:test";

import { finnishUi, localizedHead } from "./i18n";
import { studioStreamCopy } from "./studio-model";

describe("localizedHead", () => {
	test("keeps English canonical and pairs Finnish without duplicate locale prefixes", () => {
		expect(localizedHead("en", "/")[0]?.href).toBe("https://visp-stream.com/");
		expect(localizedHead("fi", "/fi")[0]?.href).toBe(
			"https://visp-stream.com/fi",
		);
		expect(localizedHead("fi", "/fi/contact")[0]?.href).toBe(
			"https://visp-stream.com/fi/contact",
		);
	});
});

describe("Finnish coverage", () => {
	test("every stream status string is translated", () => {
		const statuses = [
			"unknown",
			"idle",
			"camera-connected",
			"studio-starting",
			"overlays-active",
			"camera-only",
			"preview-failed",
		] as const;
		const missing = statuses
			.flatMap((status) => {
				const copy = studioStreamCopy(status);
				return [copy.title, copy.description];
			})
			.filter((english) => finnishUi[english] === undefined);
		expect(missing).toEqual([]);
	});

	test("the save rate-limit line keeps its placeholder in Finnish", () => {
		const english =
			"Changes weren't saved. Try again in {seconds} seconds. Your edits are still here.";
		expect(finnishUi[english]).toContain("{seconds}");
	});
});
