import { expect, test } from "bun:test";
import { validateBrowserRequest } from "./browser-security";

test("blocks private browser subresources before Chromium continues them", async () => {
	await expect(
		validateBrowserRequest(
			"https://widgets.example/widget.js",
			"widgets.example",
			async () => ["203.0.113.8"],
		),
	).resolves.toBeUndefined();
	await expect(
		validateBrowserRequest(
			"https://widgets.example/latest",
			"widgets.example",
			async () => ["169.254.169.254"],
		),
	).rejects.toThrow("public address");
	await expect(
		validateBrowserRequest(
			"http://10.0.0.1/private",
			"widgets.example",
			async () => ["10.0.0.1"],
		),
	).rejects.toThrow("public HTTPS");
});
