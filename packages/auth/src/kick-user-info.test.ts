import { describe, expect, test } from "bun:test";
import {
	fetchKickAuthUser,
	kickPlaceholderEmail,
	mapKickProfileToAuthUser,
} from "./kick-user-info";

describe("mapKickProfileToAuthUser", () => {
	test("maps a complete Kick profile", () => {
		expect(
			mapKickProfileToAuthUser({
				user_id: 42,
				name: "Streamer",
				email: "streamer@example.com",
				profile_picture: "https://kick.com/avatar.webp",
			}),
		).toEqual({
			id: "42",
			email: "streamer@example.com",
			emailVerified: false,
			name: "Streamer",
			image: "https://kick.com/avatar.webp",
		});
	});

	test("accepts string user_id and synthesizes email when Kick omits it", () => {
		expect(
			mapKickProfileToAuthUser({
				user_id: "99",
				name: "NoEmail",
			}),
		).toEqual({
			id: "99",
			email: kickPlaceholderEmail("99"),
			emailVerified: false,
			name: "NoEmail",
			image: undefined,
		});
	});

	test("treats blank email as missing and falls back for blank name", () => {
		expect(
			mapKickProfileToAuthUser({
				user_id: 7,
				name: "  ",
				email: "   ",
			}),
		).toEqual({
			id: "7",
			email: kickPlaceholderEmail("7"),
			emailVerified: false,
			name: "Kick 7",
			image: undefined,
		});
	});

	test("returns null without a usable user_id", () => {
		expect(mapKickProfileToAuthUser(undefined)).toBeNull();
		expect(mapKickProfileToAuthUser({})).toBeNull();
		expect(mapKickProfileToAuthUser({ user_id: "" })).toBeNull();
		expect(mapKickProfileToAuthUser({ user_id: null })).toBeNull();
	});
});

describe("fetchKickAuthUser", () => {
	test("returns null and does not throw when Kick responds non-OK", async () => {
		expect(
			await fetchKickAuthUser("token", async () =>
				new Response("unauthorized", { status: 401 }),
			),
		).toBeNull();
	});

	test("maps the first profile from a successful response", async () => {
		expect(
			await fetchKickAuthUser("token", async () =>
				Response.json({
					data: [{ user_id: 3, name: "Cam", email: null }],
				}),
			),
		).toEqual({
			id: "3",
			email: kickPlaceholderEmail("3"),
			emailVerified: false,
			name: "Cam",
			image: undefined,
		});
	});
});
