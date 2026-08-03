import { expect, test } from "bun:test";

// Imported straight from ./contract with no test-env bootstrap on purpose: the
// dashboard bundles this module, so it has to stay free of db/env imports.
import { chatAuthProvider } from "./contract";

test("YouTube chat uses the linked Google account", () => {
	expect(chatAuthProvider("youtube")).toBe("google");
	expect(chatAuthProvider("twitch")).toBe("twitch");
	expect(chatAuthProvider("kick")).toBe("kick");
});
