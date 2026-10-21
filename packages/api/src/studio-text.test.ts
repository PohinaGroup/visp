import { expect, test } from "bun:test";
import { studioTextHtml } from "./studio-text";

test("treats text and font URLs as data in the shared preview document", () => {
	const html = studioTextHtml({
		width: 1518,
		height: 284,
		text: '<img src="https://example.com"> & hello\nworld',
		fontUrl: '/font.woff2"><script>alert(1)</script>',
	});
	expect(html).not.toContain("<img");
	expect(html).not.toContain("<script>");
	expect(html).toContain("&amp; hello\nworld");
	expect(html).toContain("default-src 'none'");
});
