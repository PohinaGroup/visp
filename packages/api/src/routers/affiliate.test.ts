import { describe, expect, test } from "bun:test";

import { affiliateApplicationInput, affiliateRouter } from "./affiliate";

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
});
