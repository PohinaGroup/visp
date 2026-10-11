import { describe, expect, test } from "bun:test";
import {
	ROUTER_OWNED_ADMIN_PATHS,
	routerOwnedAdminEndpoints,
} from "./admin-endpoints";

describe("router-owned admin endpoints", () => {
	const [hook] = routerOwnedAdminEndpoints().hooks.before;
	const matches = (path: string) =>
		hook?.matcher({ path } as Parameters<
			NonNullable<typeof hook>["matcher"]
		>[0]);

	test("refuses Better Auth's ban, role and session revocation endpoints", () => {
		for (const path of [
			"/admin/ban-user",
			"/admin/unban-user",
			"/admin/set-role",
			"/admin/revoke-user-session",
			"/admin/revoke-user-sessions",
		]) {
			expect(ROUTER_OWNED_ADMIN_PATHS.has(path)).toBe(true);
			expect(matches(path)).toBe(true);
		}
	});

	test("leaves every other endpoint alone", () => {
		for (const path of [
			"/admin/list-users",
			"/admin/get-user",
			"/admin/list-user-sessions",
			"/get-session",
			"/sign-out",
		]) {
			expect(matches(path)).toBe(false);
		}
	});
});
