import { describe, expect, test } from "bun:test";

import {
	ADVANCED_SETUP_DEFAULTS,
	getAdvancedSetupAction,
} from "./advanced-setup";

describe("advanced setup policy", () => {
	test("completes safe defaults only for first-time users", () => {
		expect(getAdvancedSetupAction(null)).toBe("complete-defaults");
		expect(getAdvancedSetupAction("2026-07-21T08:00:00.000Z")).toBe(
			"enable-existing",
		);
		expect(ADVANCED_SETUP_DEFAULTS).toEqual({
			software: "visp",
			useCase: "phone_to_obs",
			destination: "twitch",
			advancedMode: true,
			direct: { twitch: false, kick: false, youtube: false },
			prepareObs: true,
		});
	});
});
