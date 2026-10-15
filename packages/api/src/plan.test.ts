import "./test-env";

import { describe, expect, test } from "bun:test";
import {
	entitlementFrom,
	isEntitled,
	PLAN_FEATURES,
	PLUS_QUOTAS,
	type PlanOwner,
	quotaUsedMessage,
} from "./plan";

const free: PlanOwner = {
	plan: "free",
	comped: false,
	betterTts: false,
	betterAudioIsolation: false,
	betterSubtitles: false,
	brbHighlights: false,
};
const none = { tts: 0, subtitles: 0, audio_isolation: 0, typography_export: 0 };

describe("entitlement", () => {
	test("plan, comp and override each grant; free grants nothing", () => {
		for (const feature of PLAN_FEATURES) {
			expect(isEntitled(free, feature)).toBe(false);
			expect(isEntitled({ ...free, plan: "plus" }, feature)).toBe(true);
			expect(isEntitled({ ...free, comped: true }, feature)).toBe(true);
		}
		expect(isEntitled({ ...free, betterTts: true }, "tts")).toBe(true);
		expect(isEntitled({ ...free, betterTts: true }, "subtitles")).toBe(false);
		expect(isEntitled({ ...free, brbHighlights: true }, "brb_highlights")).toBe(
			true,
		);
	});

	test("typography export and OBS backup have no override", () => {
		const everyOverride = {
			...free,
			betterTts: true,
			betterAudioIsolation: true,
			betterSubtitles: true,
			brbHighlights: true,
		};
		expect(isEntitled(everyOverride, "typography_export")).toBe(false);
		expect(isEntitled(everyOverride, "obs_backup")).toBe(false);
	});

	test("quota applies to overrides and refuses at zero", () => {
		const owner = { ...free, betterTts: true };
		expect(entitlementFrom(owner, "tts", none)).toEqual({
			entitled: true,
			allowed: true,
			remaining: PLUS_QUOTAS.tts,
		});
		expect(
			entitlementFrom(owner, "tts", { ...none, tts: PLUS_QUOTAS.tts + 5 }),
		).toEqual({ entitled: true, allowed: false, remaining: 0 });
	});

	test("stock-limited features have no monthly quota", () => {
		expect(
			entitlementFrom({ ...free, comped: true }, "obs_backup", none),
		).toEqual({ entitled: true, allowed: true, remaining: null });
	});

	test("quota message names the next calendar month in UTC", () => {
		expect(quotaUsedMessage(new Date("2026-10-31T23:30:00Z"))).toBe(
			"Monthly quota used, resets 1 Nov",
		);
	});
});
