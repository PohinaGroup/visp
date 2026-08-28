import { describe, expect, test } from "bun:test";

import "./test-env";

const {
	betterAudioIsolationConfigured,
	AudioIsolationError,
	ISOLATION_MAX_BYTES,
	isolateAudioChunk,
} = await import("./audio-isolation");

type Call = { url: string; init: RequestInit };

const recorder = (respond: () => Response) => {
	const calls: Call[] = [];
	return {
		calls,
		deps: {
			apiKey: "test-elevenlabs-key",
			fetch: (async (
				input: Parameters<typeof fetch>[0],
				init?: RequestInit,
			) => {
				calls.push({ url: String(input), init: init ?? {} });
				return respond();
			}) as typeof fetch,
		},
	};
};

describe("isolateAudioChunk", () => {
	test("posts pcm_s16le_16 to the streaming isolation endpoint", async () => {
		const { calls, deps } = recorder(
			() => new Response(new Uint8Array([4, 5, 6])),
		);
		const input = new Uint8Array([1, 2, 3]).buffer;

		const audio = await isolateAudioChunk(input, deps);

		expect(new Uint8Array(audio)).toEqual(new Uint8Array([4, 5, 6]));
		const call = calls[0];
		if (!call) throw new Error("the provider was never called");
		expect(call.url).toBe(
			"https://api.elevenlabs.io/v1/audio-isolation/stream",
		);
		expect((call.init.headers as Record<string, string>)["xi-api-key"]).toBe(
			"test-elevenlabs-key",
		);
		expect(call.init.body).toBeInstanceOf(FormData);
		const body = call.init.body as FormData;
		expect(body.get("file_format")).toBe("pcm_s16le_16");
		expect(body.get("audio")).toBeInstanceOf(Blob);
	});

	test("reports an upstream failure without repeating what it said", async () => {
		const { deps } = recorder(
			() =>
				new Response("quota exhausted for account acct_123", { status: 401 }),
		);

		const failure = isolateAudioChunk(new Uint8Array([1, 2, 3]).buffer, deps);

		await expect(failure).rejects.toThrow(AudioIsolationError);
		await expect(failure).rejects.toThrow("Isolation provider returned 401");
		await expect(failure).rejects.not.toThrow(/acct_123/);
	});

	test("refuses to call out at all when unconfigured", async () => {
		const { calls, deps } = recorder(() => new Response(null));

		await expect(
			isolateAudioChunk(new Uint8Array([1, 2, 3]).buffer, {
				...deps,
				apiKey: undefined,
			}),
		).rejects.toThrow("Better audio isolation is not configured");
		expect(calls).toHaveLength(0);
	});

	test("rejects empty or oversized chunks before calling out", async () => {
		const { calls, deps } = recorder(() => new Response(null));

		await expect(isolateAudioChunk(new ArrayBuffer(0), deps)).rejects.toThrow(
			"Invalid audio chunk",
		);
		await expect(
			isolateAudioChunk(new ArrayBuffer(ISOLATION_MAX_BYTES + 1), deps),
		).rejects.toThrow("Invalid audio chunk");
		expect(calls).toHaveLength(0);
	});
});

describe("betterAudioIsolationConfigured", () => {
	test("is false when the api key is absent in tests", () => {
		expect(betterAudioIsolationConfigured()).toBe(false);
	});
});
