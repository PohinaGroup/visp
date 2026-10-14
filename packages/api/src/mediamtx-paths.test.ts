import { afterEach, expect, test } from "bun:test";
import { fetchMediaMtxPaths, MediaMtxPathsError } from "./mediamtx-paths";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function paged(
	pages: Record<string, unknown>,
	requested: string[] = [],
): typeof fetch {
	return (async (input: string | URL | Request) => {
		requested.push(String(input));
		const page = new URL(String(input)).searchParams.get("page") ?? "";
		const body = pages[page];
		return body instanceof Response ? body : Response.json(body);
	}) as typeof fetch;
}

const path = (name: string, ready = true) => ({ name, ready });

test("aggregates every page of the list", async () => {
	const requested: string[] = [];
	globalThis.fetch = paged(
		{
			"0": { pageCount: 3, itemCount: 5, items: [path("a"), path("b")] },
			"1": { pageCount: 3, itemCount: 5, items: [path("c"), path("d")] },
			"2": { pageCount: 3, itemCount: 5, items: [path("e", false)] },
		},
		requested,
	);
	const items = await fetchMediaMtxPaths("http://relay.test:9997/", 1000);
	expect(items.map((item) => item.name)).toEqual(["a", "b", "c", "d", "e"]);
	expect(requested).toEqual([
		"http://relay.test:9997/v3/paths/list?page=0&itemsPerPage=1000",
		"http://relay.test:9997/v3/paths/list?page=1&itemsPerPage=1000",
		"http://relay.test:9997/v3/paths/list?page=2&itemsPerPage=1000",
	]);
});

test("an empty relay is one request with no items", async () => {
	const requested: string[] = [];
	globalThis.fetch = paged(
		{ "0": { pageCount: 0, itemCount: 0, items: [] } },
		requested,
	);
	expect(await fetchMediaMtxPaths("http://relay.test", 1000)).toEqual([]);
	expect(requested).toHaveLength(1);
});

test("a body without counts is read as a single page", async () => {
	globalThis.fetch = paged({ "0": { items: [path("a")] } });
	expect(await fetchMediaMtxPaths("http://relay.test", 1000)).toEqual([
		path("a"),
	]);
});

test("a failing later page aborts the whole read", async () => {
	globalThis.fetch = paged({
		"0": { pageCount: 2, itemCount: 2, items: [path("a")] },
		"1": new Response("down", { status: 503 }),
	});
	const error = await fetchMediaMtxPaths("http://relay.test", 1000).catch(
		(error) => error,
	);
	expect(error).toBeInstanceOf(MediaMtxPathsError);
	expect(error.reason).toBe("http");
});

test("a network error on a later page propagates", async () => {
	globalThis.fetch = (async (input: string | URL | Request) => {
		if (String(input).includes("page=1")) throw new Error("reset");
		return Response.json({ pageCount: 2, itemCount: 2, items: [path("a")] });
	}) as typeof fetch;
	await expect(fetchMediaMtxPaths("http://relay.test", 1000)).rejects.toThrow(
		"reset",
	);
});

test("an invalid later page aborts the whole read", async () => {
	globalThis.fetch = paged({
		"0": { pageCount: 2, itemCount: 2, items: [path("a")] },
		"1": { error: "bad" },
	});
	await expect(
		fetchMediaMtxPaths("http://relay.test", 1000),
	).rejects.toBeInstanceOf(MediaMtxPathsError);
});

test("fewer items than itemCount aborts", async () => {
	globalThis.fetch = paged({
		"0": { pageCount: 1, itemCount: 3, items: [path("a"), path("b")] },
	});
	const error = await fetchMediaMtxPaths("http://relay.test", 1000).catch(
		(error) => error,
	);
	expect(error).toBeInstanceOf(MediaMtxPathsError);
	expect(error.reason).toBe("incomplete");
});

test("a list that shifts between pages aborts", async () => {
	// Same totals, but a path moved across the page boundary mid-walk.
	globalThis.fetch = paged({
		"0": { pageCount: 2, itemCount: 2, items: [path("a")] },
		"1": { pageCount: 2, itemCount: 2, items: [path("a")] },
	});
	await expect(
		fetchMediaMtxPaths("http://relay.test", 1000),
	).rejects.toBeInstanceOf(MediaMtxPathsError);

	globalThis.fetch = paged({
		"0": { pageCount: 2, itemCount: 2, items: [path("a")] },
		"1": { pageCount: 2, itemCount: 3, items: [path("b"), path("c")] },
	});
	await expect(
		fetchMediaMtxPaths("http://relay.test", 1000),
	).rejects.toBeInstanceOf(MediaMtxPathsError);
});

test("malformed counts are rejected", async () => {
	globalThis.fetch = paged({
		"0": { pageCount: "2", itemCount: 1, items: [path("a")] },
	});
	await expect(
		fetchMediaMtxPaths("http://relay.test", 1000),
	).rejects.toBeInstanceOf(MediaMtxPathsError);
});

test("the timeout bounds the whole walk", async () => {
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		if (String(input).includes("page=0")) {
			return Response.json({ pageCount: 2, itemCount: 2, items: [path("a")] });
		}
		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () =>
				reject(init.signal?.reason),
			);
		});
	}) as typeof fetch;
	const startedAt = performance.now();
	await expect(fetchMediaMtxPaths("http://relay.test", 50)).rejects.toThrow();
	expect(performance.now() - startedAt).toBeLessThan(1000);
});
