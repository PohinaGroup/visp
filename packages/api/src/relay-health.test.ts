import "./test-env";
import { afterEach, expect, test } from "bun:test";
import { probeRelayApi } from "./relay-health";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("probe counts only ready paths and tolerates a trailing slash", async () => {
	let requested = "";
	globalThis.fetch = (async (input: string | URL | Request) => {
		requested = String(input);
		return Response.json({
			items: [
				{ name: "a", ready: true },
				{ name: "b", ready: false },
			],
		});
	}) as typeof fetch;

	const probe = await probeRelayApi("http://relay.test:9997/");
	expect(requested).toBe("http://relay.test:9997/v3/paths/list");
	expect(probe.reachable).toBe(true);
	expect(probe.livePaths).toBe(1);
	expect(probe.responseMs).toBeGreaterThanOrEqual(0);
});

test("an unreachable or erroring relay never reads as reachable", async () => {
	globalThis.fetch = (async (
		_input: string | URL | Request,
	): Promise<Response> => {
		throw new Error("connection refused");
	}) as typeof fetch;
	expect(await probeRelayApi("http://relay.test:9997")).toEqual({
		reachable: false,
		responseMs: null,
		livePaths: null,
	});

	globalThis.fetch = (async (_input: string | URL | Request) =>
		new Response("nope", { status: 500 })) as typeof fetch;
	const failed = await probeRelayApi("http://relay.test:9997");
	expect(failed.reachable).toBe(false);
	expect(failed.livePaths).toBeNull();
});
