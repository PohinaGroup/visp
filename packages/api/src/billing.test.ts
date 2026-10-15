import "./test-env";

import { describe, expect, test } from "bun:test";
import { type PlanState, planFromSubscriptions } from "./billing";

const PRODUCT = "plus-product";
const sub = (status: string, product_id = PRODUCT) => ({
	status,
	product_id,
	current_period_end: "2026-11-15T00:00:00Z",
});

describe("planFromSubscriptions", () => {
	test("active and trialing are Plus", () => {
		for (const status of ["active", "trialing"]) {
			expect(planFromSubscriptions([sub(status)], PRODUCT)).toEqual({
				plan: "plus",
				status: "active",
				periodEnd: new Date("2026-11-15T00:00:00Z"),
			});
		}
	});

	test("past due keeps Plus and is marked for the banner", () => {
		expect(planFromSubscriptions([sub("past_due")], PRODUCT).status).toBe(
			"past_due",
		);
	});

	test("canceled, unpaid or another product is free", () => {
		const free: PlanState = { plan: "free", status: null, periodEnd: null };
		expect(planFromSubscriptions([], PRODUCT)).toEqual(free);
		expect(planFromSubscriptions([sub("canceled")], PRODUCT)).toEqual(free);
		expect(planFromSubscriptions([sub("unpaid")], PRODUCT)).toEqual(free);
		expect(planFromSubscriptions([sub("active", "other")], PRODUCT)).toEqual(
			free,
		);
	});
});
