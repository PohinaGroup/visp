import "../test-env";

import { describe, expect, test } from "bun:test";

import {
	affiliateApplicationInput,
	affiliateRouter,
	notifyApplication,
} from "./affiliate";

const application = {
	applicantName: "  Stream Builder  ",
	email: "CREATOR@EXAMPLE.COM",
	youtubeChannelUrl: "https://www.youtube.com/@stream-builder",
	relevantVideoUrl: "https://youtu.be/example",
	audienceAndSetup: "  I review mobile streaming backpacks.  ",
	disclosureAccepted: true as const,
	website: "",
};

describe("affiliate applications", () => {
	test("validates and normalizes stored answers", () => {
		expect(affiliateApplicationInput.parse(application)).toEqual({
			...application,
			applicantName: "Stream Builder",
			email: "creator@example.com",
			audienceAndSetup: "I review mobile streaming backpacks.",
		});
		expect(
			affiliateApplicationInput.safeParse({
				...application,
				youtubeChannelUrl: "https://example.com/channel",
			}).success,
		).toBe(false);
	});

	test("silently accepts the honeypot without writing", async () => {
		const caller = affiliateRouter.createCaller({
			auth: null,
			headers: new Headers(),
			session: null,
		});
		expect(await caller.submit({ ...application, website: "spam" })).toEqual({
			ok: true,
		});
	});

	test("posts the application to the webhook and survives its failure", async () => {
		const parsed = affiliateApplicationInput.parse(application);
		const calls: string[] = [];
		const original = globalThis.fetch;
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			calls.push(String(init.body));
			return new Response("nope", { status: 500 });
		}) as typeof fetch;
		try {
			await notifyApplication(parsed, "https://hooks.example.com/test");
			// No URL configured must not call out at all.
			await notifyApplication(parsed, undefined);
		} finally {
			globalThis.fetch = original;
		}
		expect(calls).toHaveLength(1);
		const payload = JSON.parse(calls[0] as string);
		expect(payload.content).toBe(payload.text);
		expect(payload.content).toContain("creator@example.com");
		expect(payload.content).toContain(
			"https://www.youtube.com/@stream-builder",
		);
	});
});
