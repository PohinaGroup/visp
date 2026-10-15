import "./test-env";

import { db } from "@VISP/db";
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { type PlanState, planFromSubscriptions, syncUserPlan } from "./billing";

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

describe("syncUserPlan", () => {
	const realFetch = globalThis.fetch;
	afterAll(() => {
		globalThis.fetch = realFetch;
		transaction.mockRestore();
	});

	/** Stands in for Postgres: one transaction at a time, writes recorded. */
	const writes: string[] = [];
	let queue = Promise.resolve();
	const transaction = spyOn(db, "transaction").mockImplementation(((
		run: (tx: unknown) => Promise<unknown>,
	) => {
		const turn = queue.then(() =>
			run({
				execute: async () => undefined,
				update: () => ({
					set: (values: { plan: string }) => ({
						where: () => ({
							returning: async () => {
								writes.push(values.plan);
								return [{ id: "user-1" }];
							},
						}),
					}),
				}),
			}),
		);
		queue = turn.then(
			() => undefined,
			() => undefined,
		);
		return turn;
	}) as never);

	test("two concurrent syncs for one user end with the later answer", async () => {
		// Polar answers free slowly, then plus at once: without the lock the
		// fast "plus" lands first and the stale "free" overwrites it.
		let calls = 0;
		globalThis.fetch = (async (_input: Request | string | URL) => {
			const plus = calls++ > 0;
			if (!plus) await new Promise((resolve) => setTimeout(resolve, 20));
			return Response.json({
				items: plus
					? [
							{
								status: "active",
								product_id: "plus-product",
								current_period_end: null,
							},
						]
					: [],
				pagination: { total_count: plus ? 1 : 0, max_page: 1 },
			});
		}) as typeof fetch;
		await Promise.all([syncUserPlan("user-1"), syncUserPlan("user-1")]);
		expect(writes).toEqual(["free", "plus"]);
	});
});
