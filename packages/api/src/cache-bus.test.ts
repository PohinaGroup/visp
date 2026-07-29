import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import "./test-env";

const {
	decodeInvalidation,
	encodeInvalidation,
	FULL_INVALIDATION,
	subscribeInvalidations,
} = await import("./cache-bus");

describe("cache bus", () => {
	test("encodes only valid invalidation payloads", () => {
		const payload = { type: "user", userId: "user-a" } as const;
		expect(decodeInvalidation(encodeInvalidation(payload))).toEqual(payload);
		expect(decodeInvalidation('{"type":"slug","slug":"streamer-1"}')).toEqual({
			type: "slug",
			slug: "streamer-1",
		});
		expect(decodeInvalidation('{"type":"slug"}')).toBeNull();
		expect(decodeInvalidation("nope")).toBeNull();
	});

	test("full-flushes on the initial connection and reconnect", async () => {
		const clients: FakeClient[] = [];
		const seen: unknown[] = [];
		const stop = subscribeInvalidations((payload) => seen.push(payload), {
			connect: async () => {
				const client = new FakeClient();
				clients.push(client);
				return client as never;
			},
			retryMs: 1,
		});
		await Bun.sleep(0);
		expect(seen).toEqual([FULL_INVALIDATION]);
		clients[0]?.emit("error", new Error("connection lost"));
		await Bun.sleep(5);
		expect(seen).toEqual([FULL_INVALIDATION, FULL_INVALIDATION]);
		stop();
	});
});

class FakeClient extends EventEmitter {
	query() {
		return Promise.resolve();
	}

	release() {}
}
