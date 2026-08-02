import { expect, test } from "bun:test";

import "../test-env";

const { chatAuthProvider } = await import("./connections");

test("YouTube chat uses the linked Google account", () => {
	expect(chatAuthProvider("youtube")).toBe("google");
	expect(chatAuthProvider("twitch")).toBe("twitch");
	expect(chatAuthProvider("kick")).toBe("kick");
});
