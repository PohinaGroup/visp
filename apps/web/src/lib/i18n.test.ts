import { describe, expect, test } from "bun:test";

import { localizedHead } from "./i18n";

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
