import { expect, test } from "bun:test";
import { buildWhepRequest } from "./whep-preview";

test("sends WHEP credentials with HTTP Basic auth", () => {
	const request = buildWhepRequest(
		"https://relay.test/path/whep?user=creator&pass=secret",
		"offer",
	);

	expect(request.url).toBe("https://relay.test/path/whep");
	expect(request.init).toEqual({
		method: "POST",
		headers: {
			"Content-Type": "application/sdp",
			Authorization: `Basic ${btoa("creator:secret")}`,
		},
		body: "offer",
	});
});
