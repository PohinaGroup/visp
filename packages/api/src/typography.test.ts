import { describe, expect, test } from "bun:test";

import "./test-env";

const { captionFilter } = await import("./typography");

describe("captionFilter", () => {
	test("keeps a phrase on its source-word time range and escapes filter text", () => {
		const result = captionFilter({
			version: 1,
			style: "TikTok Basic",
			intensity: 50,
			hook: "",
			captionY: 62,
			words: [
				{ id: "1", text: "we're", start: 1.2, end: 1.5, emphasis: 0, group: 0 },
				{ id: "2", text: "ready", start: 1.6, end: 2, emphasis: 0, group: 0 },
			],
		});

		expect(result).toContain("WE\\'RE READY");
		expect(result).toContain("between(t,1.2,2)");
	});
});
