import { describe, expect, test } from "bun:test";
import {
	authenticatedPost,
	normalizeServerOrigin,
	sessionCookie,
} from "./server-api";

describe("server-api", () => {
	test("normalizeServerOrigin strips a trailing slash", () => {
		expect(normalizeServerOrigin("https://example.com/")).toBe(
			"https://example.com",
		);
	});

	test("sessionCookie reads from getCookie when present", () => {
		expect(sessionCookie(() => "session=abc")).toBe("session=abc");
		expect(sessionCookie(undefined)).toBeUndefined();
	});

	test("authenticatedPost sends JSON with the session cookie", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetch = (async (url: string | URL, init?: RequestInit) => {
			calls.push({ url: String(url), init: init ?? {} });
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}) as typeof globalThis.fetch;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetch;
		try {
			await authenticatedPost(
				"https://example.com",
				"/api/tts",
				{ text: "hi", language: "en" },
				"session=abc",
			);
		} finally {
			globalThis.fetch = originalFetch;
		}

		const call = calls[0];
		if (!call) throw new Error("fetch was not called");
		expect(call.url).toBe("https://example.com/api/tts");
		expect(call.init.method).toBe("POST");
		expect(call.init.credentials).toBe("include");
		expect((call.init.headers as Headers).get("Cookie")).toBe("session=abc");
		expect(call.init.body).toBe(JSON.stringify({ text: "hi", language: "en" }));
	});
});
