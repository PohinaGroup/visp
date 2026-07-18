import { expect, test } from "bun:test";
import {
	deleteStreamUrl,
	loadOrCreateInstallationId,
	loadStreamUrl,
	saveStreamUrl,
} from "./stream-url.web";

test("web storage persists only the installation id, not publish credentials", async () => {
	const persisted = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => persisted.get(key) ?? null,
			setItem: (key: string, value: string) => persisted.set(key, value),
		},
	});
	const publishUrl =
		"srt://relay.example.com:8890?streamid=publish:alpha:device:secret";

	await saveStreamUrl(publishUrl, "user-a");
	expect(await loadStreamUrl("user-a")).toBe(publishUrl);
	expect(await loadStreamUrl("user-b")).toBeNull();
	await loadOrCreateInstallationId();
	expect([...persisted.keys()]).toEqual(["visp.publish.installation-id"]);
	expect([...persisted.values()]).not.toContain(publishUrl);

	await deleteStreamUrl();
	expect(await loadStreamUrl("user-a")).toBeNull();
	Reflect.deleteProperty(globalThis, "localStorage");
});
