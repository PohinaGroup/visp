import "../test-env";

import { describe, expect, test } from "bun:test";
import { relayLimiterFor, resetRelayMutationLimitForTests } from "./relay";

describe("relay mutation limits", () => {
	test("telemetry and OBS traffic cannot spend the editing budget", () => {
		resetRelayMutationLimitForTests();
		const user = "user-a";
		// Saturate both background classes the way a live stream does.
		for (let call = 0; call < 200; call += 1) {
			relayLimiterFor("rtt.submit").take(user);
			relayLimiterFor("paths.reportLinkStats").take(user);
			relayLimiterFor("obs.setScene").take(user);
		}
		expect(relayLimiterFor("rtt.submit").take(user)).toBe(false);
		expect(relayLimiterFor("obs.setScene").take(user)).toBe(false);
		// A Studio save still goes through, and its own budget is intact.
		expect(relayLimiterFor("studio.save").take(user)).toBe(true);
		expect(relayLimiterFor("studio.save").retryAfterMs(user)).toBe(0);
		resetRelayMutationLimitForTests();
	});

	test("each class is still capped on its own", () => {
		resetRelayMutationLimitForTests();
		const saves = relayLimiterFor("studio.save");
		for (let call = 0; call < 20; call += 1)
			expect(saves.take("user-b")).toBe(true);
		expect(saves.take("user-b")).toBe(false);
		expect(saves.retryAfterMs("user-b")).toBeGreaterThan(0);
		resetRelayMutationLimitForTests();
	});

	test("routes each procedure to its own bucket", () => {
		expect(relayLimiterFor("rtt.submit")).toBe(
			relayLimiterFor("paths.reportLinkStats"),
		);
		expect(relayLimiterFor("obs.tiles.create")).toBe(
			relayLimiterFor("obs.pair"),
		);
		expect(relayLimiterFor("studio.save")).not.toBe(
			relayLimiterFor("rtt.submit"),
		);
		expect(relayLimiterFor("studio.save")).not.toBe(
			relayLimiterFor("obs.pair"),
		);
		// "obsolete" must not be mistaken for the OBS namespace.
		expect(relayLimiterFor("obsolete.thing")).toBe(
			relayLimiterFor("studio.save"),
		);
	});
});
