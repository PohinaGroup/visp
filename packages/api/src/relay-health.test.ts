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
	expect(requested).toBe(
		"http://relay.test:9997/v3/paths/list?page=0&itemsPerPage=1000",
	);
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

test("probe counts ready paths across every page", async () => {
	globalThis.fetch = (async (input: string | URL | Request) => {
		const page = new URL(String(input)).searchParams.get("page");
		return Response.json({
			pageCount: 2,
			itemCount: 3,
			items:
				page === "0"
					? [
							{ name: "a", ready: true },
							{ name: "b", ready: false },
						]
					: [{ name: "c", ready: true }],
		});
	}) as typeof fetch;
	const probe = await probeRelayApi("http://relay.test:9997");
	expect(probe.reachable).toBe(true);
	expect(probe.livePaths).toBe(2);
});

test("a short page leaves the live count unknown", async () => {
	globalThis.fetch = (async () =>
		Response.json({
			pageCount: 1,
			itemCount: 2,
			items: [{ name: "a", ready: true }],
		})) as unknown as typeof fetch;
	const probe = await probeRelayApi("http://relay.test:9997");
	expect(probe.reachable).toBe(true);
	expect(probe.livePaths).toBeNull();
});
