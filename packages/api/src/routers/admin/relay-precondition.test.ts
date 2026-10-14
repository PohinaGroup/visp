import { describe, expect, test } from "bun:test";

import { relayPreconditionMismatches } from "./relay-precondition";

const current = {
	enabled: true,
	drainedAt: null,
	capacityPaths: 100,
	maxForwarders: 2,
};

describe("relay update precondition", () => {
	test("passes without an expectation or when it matches", () => {
		expect(relayPreconditionMismatches(current, undefined)).toEqual([]);
		expect(
			relayPreconditionMismatches(current, {
				enabled: true,
				drained: false,
				capacityPaths: 100,
				maxForwarders: 2,
			}),
		).toEqual([]);
	});

	test("names every field that changed underneath the admin", () => {
		expect(
			relayPreconditionMismatches(
				{ ...current, enabled: false, drainedAt: new Date() },
				{ enabled: true, drained: false, capacityPaths: 100 },
			),
		).toEqual(["enabled", "drained"]);
		expect(relayPreconditionMismatches(current, { maxForwarders: 3 })).toEqual([
			"maxForwarders",
		]);
	});
});
