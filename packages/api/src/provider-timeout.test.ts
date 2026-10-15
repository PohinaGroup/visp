import { describe, expect, test } from "bun:test";

import { withProviderTimeout } from "./provider-timeout";

function stalledFetch(init: RequestInit) {
	return new Promise<Response>((_, reject) => {
		init.signal?.addEventListener("abort", () =>
			reject(init.signal?.reason ?? new Error("aborted")),
		);
	});
}

describe("withProviderTimeout", () => {
	test("aborts a provider that never answers", async () => {
		const init = withProviderTimeout({ method: "POST" }, 20);
		expect(init.method).toBe("POST");
		await expect(stalledFetch(init)).rejects.toThrow();
		expect(init.signal?.aborted).toBe(true);
	});

	test("keeps the caller's own signal working alongside the timeout", async () => {
		const caller = new AbortController();
		const init = withProviderTimeout({ signal: caller.signal }, 60_000);
		expect(init.signal).not.toBe(caller.signal);
		const pending = stalledFetch(init);
		caller.abort(new Error("caller gave up"));
		await expect(pending).rejects.toThrow("caller gave up");
	});

	test("the timeout still applies when the caller passed a signal", async () => {
		const caller = new AbortController();
		const init = withProviderTimeout({ signal: caller.signal }, 20);
		await expect(stalledFetch(init)).rejects.toThrow();
		expect(caller.signal.aborted).toBe(false);
	});
});
