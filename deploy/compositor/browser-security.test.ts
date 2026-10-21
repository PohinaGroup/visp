import { expect, test } from "bun:test";
import { gateBrowserRequest, validateBrowserRequest } from "./browser-security";

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

test("a blocked subresource is failed without poisoning the layer", async () => {
	const calls: [string, object | undefined][] = [];
	const command = async (method: string, params?: object) => {
		calls.push([method, params]);
	};
	const resolve = async () => ["203.0.113.8"];
	const gate = (event: Parameters<typeof gateBrowserRequest>[0]) =>
		gateBrowserRequest(event, "widgets.example", "main", command, resolve);
	await expect(
		gate({
			requestId: "1",
			request: { url: "https://analytics.example/script.js" },
			resourceType: "Script",
			frameId: "main",
		}),
	).resolves.toBeUndefined();
	await expect(
		gate({
			requestId: "2",
			request: { url: "https://widgets.example/widget.js" },
			resourceType: "Script",
			frameId: "main",
		}),
	).resolves.toBeUndefined();
	await expect(
		gate({
			requestId: "3",
			request: { url: "https://embed.example/" },
			resourceType: "Document",
			frameId: "child",
		}),
	).resolves.toBeUndefined();
	await expect(
		gate({
			requestId: "4",
			request: { url: "https://evil.example/" },
			resourceType: "Document",
			frameId: "main",
		}),
	).resolves.toBeInstanceOf(Error);
	expect(calls).toEqual([
		["Fetch.failRequest", { requestId: "1", errorReason: "BlockedByClient" }],
		["Fetch.continueRequest", { requestId: "2" }],
		["Fetch.failRequest", { requestId: "3", errorReason: "BlockedByClient" }],
		["Fetch.failRequest", { requestId: "4", errorReason: "BlockedByClient" }],
	]);
});
