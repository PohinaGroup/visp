import { describe, expect, test } from "bun:test";
import { readBodyWithLimit } from "./body-limit";

function streamed(bytes: Uint8Array, chunk = 4) {
	return new Request("http://localhost/", {
		method: "POST",
		body: new ReadableStream({
			start(controller) {
				for (let i = 0; i < bytes.length; i += chunk)
					controller.enqueue(bytes.subarray(i, i + chunk));
				controller.close();
			},
		}),
		duplex: "half",
	} as RequestInit);
}

describe("readBodyWithLimit", () => {
	test("returns a body at or under the limit", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(
			await readBodyWithLimit(
				new Request("http://localhost/", { method: "POST", body: bytes }),
				8,
			),
		).toEqual(bytes);
		expect(await readBodyWithLimit(streamed(bytes), 8)).toEqual(bytes);
	});

	test("refuses a declared Content-Length over the limit", async () => {
		const request = new Request("http://localhost/", {
			method: "POST",
			body: new Uint8Array(9),
		});
		expect(await readBodyWithLimit(request, 8)).toBeNull();
	});

	test("stops a streamed body as soon as it passes the limit", async () => {
		expect(await readBodyWithLimit(streamed(new Uint8Array(9)), 8)).toBeNull();
	});

	test("treats a missing body as empty", async () => {
		const body = await readBodyWithLimit(
			new Request("http://localhost/", { method: "POST" }),
			8,
		);
		expect(body?.byteLength).toBe(0);
	});
});
