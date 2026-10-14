import { describe, expect, test } from "bun:test";

import { analyticsAllowed } from "./analytics";
import {
	backoffRefetchInterval,
	isProtectedPath,
	isUnauthorizedError,
	loginRedirectHref,
	type PollableQuery,
	pollWithBackoff,
} from "./query-resilience";

function query(status: string, errorUpdateCount: number): PollableQuery {
	return { state: { status, errorUpdateCount } };
}

describe("poll backoff", () => {
	test("polls at the base interval while healthy", () => {
		expect(backoffRefetchInterval(query("success", 0), 3000)).toBe(3000);
		expect(backoffRefetchInterval(query("pending", 0), 3000)).toBe(3000);
	});

	test("doubles per consecutive failure and caps at a minute", () => {
		const q = query("error", 1);
		expect(backoffRefetchInterval(q, 3000)).toBe(6000);
		q.state.errorUpdateCount = 2;
		expect(backoffRefetchInterval(q, 3000)).toBe(12_000);
		q.state.errorUpdateCount = 10;
		expect(backoffRefetchInterval(q, 3000)).toBe(60_000);
	});

	test("never shortens a base interval longer than the cap", () => {
		expect(backoffRefetchInterval(query("error", 5), 120_000)).toBe(120_000);
	});

	test("counts failures from the last success, not the query's lifetime", () => {
		const q = query("success", 7);
		expect(backoffRefetchInterval(q, 2000)).toBe(2000);
		q.state.status = "error";
		q.state.errorUpdateCount = 8;
		expect(backoffRefetchInterval(q, 2000)).toBe(4000);
	});

	test("keeps a disabled poll disabled", () => {
		expect(backoffRefetchInterval(query("error", 3), false)).toBe(false);
		expect(backoffRefetchInterval(query("success", 0), undefined)).toBe(false);
	});

	test("pollWithBackoff turns off react-query retries", () => {
		const options = pollWithBackoff(5000);
		expect(options.retry).toBe(false);
		expect(options.refetchInterval(query("error", 1))).toBe(10_000);
	});
});

describe("session expiry", () => {
	test("recognises tRPC UNAUTHORIZED errors only", () => {
		expect(isUnauthorizedError({ data: { code: "UNAUTHORIZED" } })).toBe(true);
		expect(isUnauthorizedError({ data: { code: "FORBIDDEN" } })).toBe(false);
		expect(isUnauthorizedError(new Error("UNAUTHORIZED"))).toBe(false);
		expect(isUnauthorizedError(null)).toBe(false);
	});

	test("redirects only from the signed-in app", () => {
		expect(isProtectedPath("/dashboard")).toBe(true);
		expect(isProtectedPath("/studio/")).toBe(true);
		expect(isProtectedPath("/setup")).toBe(true);
		expect(isProtectedPath("/login")).toBe(false);
		expect(isProtectedPath("/")).toBe(false);
		expect(isProtectedPath("/overlay")).toBe(false);
	});

	test("login link returns to the current page and keeps the locale", () => {
		expect(
			loginRedirectHref({
				pathname: "/dashboard",
				search: "?lang=fi",
				hash: "#studio",
			}),
		).toBe("/login?redirect=%2Fdashboard%3Flang%3Dfi%23studio&lang=fi");
		expect(loginRedirectHref({ pathname: "/studio", search: "" })).toBe(
			"/login?redirect=%2Fstudio",
		);
	});
});

describe("analytics exclusions", () => {
	test("skips routes with a secret in the URL", () => {
		expect(analyticsAllowed("/overlay")).toBe(false);
		expect(analyticsAllowed("/device")).toBe(false);
		expect(analyticsAllowed("/device/")).toBe(false);
		expect(analyticsAllowed("/dashboard")).toBe(true);
		expect(analyticsAllowed(undefined)).toBe(true);
	});
});
