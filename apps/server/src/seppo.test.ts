import "./test-env";

import { beforeEach, describe, expect, test } from "bun:test";

const {
	landingSuggestionResponse,
	resetSeppoRateLimit,
	SEPPO_MAX_BODY_BYTES,
	seppoRoutes,
	takeLandingRequest,
	validateSeppoMessages,
} = await import("./seppo");

describe("Seppo assistant", () => {
	beforeEach(resetSeppoRateLimit);

	test("requires authentication for setup and dashboard", async () => {
		for (const context of ["setup", "dashboard"]) {
			const response = await seppoRoutes.handle(
				new Request("http://localhost/api/seppo", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						context,
						messages: [
							{
								id: "1",
								role: "user",
								parts: [{ type: "text", text: "Hi" }],
							},
						],
					}),
				}),
			);
			expect(response.status).toBe(401);
		}
	});

	test("allows landing validation without authentication", async () => {
		const response = await seppoRoutes.handle(
			new Request("http://localhost/api/seppo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ context: "landing", messages: [] }),
			}),
		);
		expect(response.status).toBe(400);
	});

	test("returns fixed landing suggestion responses without generation", async () => {
		const messages = [
			{
				id: "1",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "What is VISP for?" }],
			},
		];
		const fixedResponse = landingSuggestionResponse(messages);
		expect(fixedResponse).toBeDefined();

		const response = await seppoRoutes.handle(
			new Request("http://localhost/api/seppo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ context: "landing", messages }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(fixedResponse as string);
	});

	test("limits landing generation requests by source IP", () => {
		for (let request = 0; request < 20; request++) {
			expect(takeLandingRequest("203.0.113.1", 1_000)).toBe(true);
		}
		expect(takeLandingRequest("203.0.113.1", 1_000)).toBe(false);
		expect(takeLandingRequest("203.0.113.2", 1_000)).toBe(true);
		expect(takeLandingRequest("203.0.113.1", 601_000)).toBe(true);
	});

	test("accepts a small text transcript and rejects unsafe payloads", async () => {
		expect(
			await validateSeppoMessages(
				[
					{
						id: "1",
						role: "user",
						parts: [{ type: "text", text: "Help me choose" }],
					},
				],
				"landing",
			),
		).not.toBeNull();
		expect(
			await validateSeppoMessages(
				[
					{
						id: "1",
						role: "user",
						parts: [{ type: "text", text: "x".repeat(2_001) }],
					},
				],
				"landing",
			),
		).toBeNull();
		expect(
			await validateSeppoMessages(
				[
					{
						id: "1",
						role: "user",
						parts: [
							{ type: "file", mediaType: "text/plain", url: "data:,secret" },
						],
					},
				],
				"landing",
			),
		).toBeNull();
	});

	test("accepts an assistant tool-call continuation as the last message", async () => {
		expect(
			await validateSeppoMessages([
				{
					id: "1",
					role: "user",
					parts: [{ type: "text", text: "I stream from my phone" }],
				},
				{
					id: "2",
					role: "assistant",
					parts: [
						{ type: "step-start" },
						{ type: "text", text: "Got it — phone into OBS." },
						{
							type: "tool-setUseCase",
							toolCallId: "call-1",
							state: "output-available",
							input: { useCase: "phone_to_obs" },
							output: "Set use case to phone_to_obs",
						},
					],
				},
			]),
		).not.toBeNull();
	});

	test("keeps tool continuations inside their context", async () => {
		const setupContinuation = [
			{
				id: "1",
				role: "user",
				parts: [{ type: "text", text: "Use my phone" }],
			},
			{
				id: "2",
				role: "assistant",
				parts: [
					{
						type: "tool-setUseCase",
						toolCallId: "call-1",
						state: "output-available",
						input: { useCase: "phone_to_obs" },
						output: "ok",
					},
				],
			},
		];
		expect(
			await validateSeppoMessages(setupContinuation, "setup"),
		).not.toBeNull();
		expect(
			await validateSeppoMessages(setupContinuation, "landing"),
		).toBeNull();
		expect(
			await validateSeppoMessages(setupContinuation, "dashboard"),
		).toBeNull();

		expect(
			await validateSeppoMessages(
				[
					{
						id: "1",
						role: "user",
						parts: [{ type: "text", text: "Check OBS" }],
					},
					{
						id: "2",
						role: "assistant",
						parts: [
							{
								type: "tool-inspectDashboard",
								toolCallId: "call-2",
								state: "output-available",
								input: {},
								output: "{}",
							},
						],
					},
				],
				"dashboard",
			),
		).not.toBeNull();
	});

	test("rejects tool parts without output and unknown tools", async () => {
		expect(
			await validateSeppoMessages([
				{
					id: "1",
					role: "user",
					parts: [{ type: "text", text: "Hi" }],
				},
				{
					id: "2",
					role: "assistant",
					parts: [
						{
							type: "tool-setUseCase",
							toolCallId: "call-1",
							state: "input-available",
							input: { useCase: "phone_to_obs" },
						},
					],
				},
			]),
		).toBeNull();
		expect(
			await validateSeppoMessages([
				{
					id: "1",
					role: "user",
					parts: [{ type: "text", text: "Hi" }],
				},
				{
					id: "2",
					role: "assistant",
					parts: [
						{
							type: "tool-doSomethingElse",
							toolCallId: "call-1",
							state: "output-available",
							input: {},
							output: "ok",
						},
					],
				},
				{
					id: "3",
					role: "user",
					parts: [{ type: "text", text: "And now?" }],
				},
			]),
		).toBeNull();
	});

	test("refuses an oversized body before parsing it", async () => {
		const oversized = JSON.stringify({
			context: "landing",
			messages: [],
			padding: "x".repeat(SEPPO_MAX_BODY_BYTES),
		});
		const declared = await seppoRoutes.handle(
			new Request("http://localhost/api/seppo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: oversized,
			}),
		);
		expect(declared.status).toBe(413);

		// No Content-Length: the streamed read stops at the cap instead.
		const bytes = new TextEncoder().encode(oversized);
		const streamed = await seppoRoutes.handle(
			new Request("http://localhost/api/seppo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: new ReadableStream({
					start(controller) {
						for (let i = 0; i < bytes.length; i += 16_384)
							controller.enqueue(bytes.subarray(i, i + 16_384));
						controller.close();
					},
				}),
				duplex: "half",
			} as RequestInit),
		);
		expect(streamed.status).toBe(413);
	});

	test("the largest accepted transcript fits under the body cap", async () => {
		// Control characters are the worst case: six bytes each once escaped.
		const messages = Array.from({ length: 10 }, (_, index) => ({
			id: String(index),
			role: "user" as const,
			parts: [{ type: "text" as const, text: "\u0001".repeat(2_000) }],
		}));
		expect(await validateSeppoMessages(messages, "landing")).not.toBeNull();
		expect(
			new TextEncoder().encode(JSON.stringify({ context: "landing", messages }))
				.byteLength,
		).toBeLessThan(SEPPO_MAX_BODY_BYTES);
	});

	test("rate limits anonymous callers before validating messages", async () => {
		for (let request = 0; request < 20; request++) takeLandingRequest("direct");
		const response = await seppoRoutes.handle(
			new Request("http://localhost/api/seppo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ context: "landing", messages: [] }),
			}),
		);
		expect(response.status).toBe(429);
	});
});
