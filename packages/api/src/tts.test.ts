import { describe, expect, test } from "bun:test";

import "./test-env";

const { synthesizeSpeech, TtsError, TTS_MODEL_ID } = await import("./tts");

type Call = { url: string; init: RequestInit };

// Credentials are injected, so these tests do not care whether the env module
// was parsed with ElevenLabs configured.
const recorder = (respond: () => Response) => {
	const calls: Call[] = [];
	return {
		calls,
		deps: {
			apiKey: "test-elevenlabs-key",
			voiceId: "test-voice",
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

describe("synthesizeSpeech", () => {
	test("asks the configured voice for a language-pinned utterance", async () => {
		const { calls, deps } = recorder(
			() => new Response(new Uint8Array([1, 2, 3])),
		);

		const audio = await synthesizeSpeech(
			{ text: "moikka terveisin Joni", language: "fi" },
			deps,
		);

		expect(new Uint8Array(audio)).toEqual(new Uint8Array([1, 2, 3]));
		const call = calls[0];
		if (!call) throw new Error("the provider was never called");
		expect(call.url).toContain(
			"https://api.elevenlabs.io/v1/text-to-speech/test-voice",
		);
		expect(call.url).toContain("output_format=mp3_22050_32");
		expect((call.init.headers as Record<string, string>)["xi-api-key"]).toBe(
			"test-elevenlabs-key",
		);
		expect(JSON.parse(String(call.init.body))).toEqual({
			text: "moikka terveisin Joni",
			model_id: TTS_MODEL_ID,
			language_code: "fi",
		});
	});

	test("reports an upstream failure without repeating what it said", async () => {
		const { deps } = recorder(
			() =>
				new Response("quota exhausted for account acct_123", { status: 401 }),
		);

		const failure = synthesizeSpeech(
			{ text: "hi says Joni", language: "en" },
			deps,
		);

		await expect(failure).rejects.toThrow(TtsError);
		await expect(failure).rejects.toThrow("Speech provider returned 401");
		await expect(failure).rejects.not.toThrow(/acct_123/);
	});

	test("refuses to call out at all when unconfigured", async () => {
		const { calls, deps } = recorder(() => new Response(null));

		await expect(
			synthesizeSpeech(
				{ text: "hi says Joni", language: "en" },
				{ ...deps, apiKey: undefined, voiceId: undefined },
			),
		).rejects.toThrow("Speech is not configured");
		expect(calls).toHaveLength(0);
	});
});
