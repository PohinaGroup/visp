import { describe, expect, test } from "bun:test";

import "./test-env";

const {
	createScribeToken,
	SCRIBE_AUDIO_FORMAT,
	SCRIBE_MODEL_ID,
	SubtitlesError,
} = await import("./subtitles");

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

describe("createScribeToken", () => {
	test("mints a single-use token and builds the realtime ws url", async () => {
		const { calls, deps } = recorder(
			() =>
				new Response(JSON.stringify({ token: "scribe-token-abc" }), {
					headers: { "Content-Type": "application/json" },
				}),
		);

		const result = await createScribeToken({ language: "fi" }, deps);

		expect(result.token).toBe("scribe-token-abc");
		expect(result.modelId).toBe(SCRIBE_MODEL_ID);
		expect(result.audioFormat).toBe(SCRIBE_AUDIO_FORMAT);
		expect(result.wsUrl).toContain(
			"wss://api.elevenlabs.io/v1/speech-to-text/realtime?",
		);
		expect(result.wsUrl).toContain("token=scribe-token-abc");
		expect(result.wsUrl).toContain("language_code=fi");
		expect(result.wsUrl).toContain(`model_id=${SCRIBE_MODEL_ID}`);
		expect(result.wsUrl).toContain(`audio_format=${SCRIBE_AUDIO_FORMAT}`);

		const call = calls[0];
		if (!call) throw new Error("the provider was never called");
		expect(call.url).toBe(
			"https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
		);
		expect((call.init.headers as Record<string, string>)["xi-api-key"]).toBe(
			"test-elevenlabs-key",
		);
	});

	test("reports an upstream failure without repeating what it said", async () => {
		const { deps } = recorder(
			() =>
				new Response("quota exhausted for account acct_123", { status: 401 }),
		);

		const failure = createScribeToken({ language: "en" }, deps);

		await expect(failure).rejects.toThrow(SubtitlesError);
		await expect(failure).rejects.toThrow("Subtitles provider returned 401");
		await expect(failure).rejects.not.toThrow(/acct_123/);
	});

	test("refuses to call out at all when unconfigured", async () => {
		const { calls, deps } = recorder(() => new Response(null));

		await expect(
			createScribeToken(
				{ language: "en" },
				{ ...deps, apiKey: undefined },
			),
		).rejects.toThrow("Better subtitles are not configured");
		expect(calls).toHaveLength(0);
	});
});
