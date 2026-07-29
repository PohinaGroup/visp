import { describe, expect, test } from "bun:test";

import {
	hasScope,
	hasStreamKeyScope,
	linkScopes,
	PROVIDER_SCOPES,
	parseScopes,
} from "./scopes";

describe("parseScopes", () => {
	test("splits space and comma separated scope strings", () => {
		expect(parseScopes("a b")).toEqual(["a", "b"]);
		expect(parseScopes("user:read,channel:write")).toEqual([
			"user:read",
			"channel:write",
		]);
		expect(parseScopes(null)).toEqual([]);
		expect(
			hasScope("a channel:manage:broadcast b", "channel:manage:broadcast"),
		).toBe(true);
		expect(hasScope(undefined, "a")).toBe(false);
	});
});

describe("linkScopes", () => {
	test("returns the union of granted and newly requested scopes", () => {
		expect(linkScopes("twitch", ["a"], ["b"])).toEqual(["a", "b"]);
	});

	test("does not duplicate a scope that is already granted", () => {
		expect(linkScopes("twitch", ["a", "b"], ["b"])).toEqual(["a", "b"]);
	});

	test("keeps granted scopes when nothing is being added", () => {
		expect(linkScopes("twitch", ["a", "b"])).toEqual(["a", "b"]);
	});

	// The regression this module exists for: a link initiated for Direct must
	// not drop chat and title/category consent granted earlier.
	test("linking for Direct re-requests chat scopes stored on account.scope", () => {
		const granted = parseScopes(
			"user:read:email openid user:read:chat channel:manage:broadcast",
		);
		const requested = linkScopes("twitch", granted, [
			PROVIDER_SCOPES.twitch.streamKey,
		]);

		expect(requested).toContain("user:read:chat");
		expect(requested).toContain("channel:manage:broadcast");
		expect(requested).toContain("channel:read:stream_key");
	});

	// /oauth2/link replaces the genericOAuth config scopes instead of merging
	// them, so a Kick link that omits them de-authorizes title and category.
	test("always names Kick's config scopes, which link calls would otherwise drop", () => {
		expect(linkScopes("kick", [])).toEqual(["user:read", "channel:write"]);
		expect(
			linkScopes("kick", [], PROVIDER_SCOPES.kick.streamKeyRequest),
		).toEqual(["user:read", "channel:write", "streamkey:read", "channel:read"]);
	});
});

describe("hasStreamKeyScope", () => {
	test("Kick requires both streamkey:read and channel:read", () => {
		expect(hasStreamKeyScope("kick", "streamkey:read channel:read")).toBe(true);
		expect(hasStreamKeyScope("kick", "streamkey:read")).toBe(false);
		expect(hasStreamKeyScope("twitch", "channel:read:stream_key")).toBe(true);
	});
});
