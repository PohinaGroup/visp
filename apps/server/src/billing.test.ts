import "./test-env";

import { db } from "@VISP/db";
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";

const { billingRoutes } = await import("./billing");

const SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "";
const realFetch = globalThis.fetch;

/** applyPlan's one write, captured instead of hitting a database. */
const writes: unknown[] = [];
const update = spyOn(db, "update").mockImplementation(
	() =>
		({
			set: (values: unknown) => ({
				where: () => ({
					returning: async () => {
						writes.push(values);
						return [{ id: "user-1" }];
					},
				}),
			}),
		}) as never,
);

function delivery(payload: unknown, secret = SECRET) {
	const body = JSON.stringify(payload);
	const id = "msg_test";
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac("sha256", secret)
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64");
	return billingRoutes.handle(
		new Request("http://localhost/api/webhooks/polar", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"webhook-id": id,
				"webhook-timestamp": String(timestamp),
				"webhook-signature": `v1,${signature}`,
			},
			body,
		}),
	);
}

describe("Polar webhook", () => {
	afterAll(() => {
		globalThis.fetch = realFetch;
		update.mockRestore();
	});

	test("re-reads the plan from Polar and writes Plus", async () => {
		globalThis.fetch = (async (input: Request | string | URL) => {
			const url = new URL(input instanceof Request ? input.url : input);
			expect(url.pathname).toBe("/v1/subscriptions/");
			expect(url.searchParams.get("external_customer_id")).toBe("user-1");
			return Response.json({
				items: [
					{
						status: "active",
						product_id: process.env.POLAR_PRODUCT_ID,
						current_period_end: "2026-11-15T00:00:00Z",
					},
				],
				pagination: { total_count: 1, max_page: 1 },
			});
		}) as typeof fetch;
		const response = await delivery({
			type: "customer.state_changed",
			timestamp: new Date().toISOString(),
			data: { external_id: "user-1" },
		});
		expect(response.status).toBe(204);
		expect(writes).toEqual([
			{
				plan: "plus",
				planStatus: "active",
				planPeriodEnd: new Date("2026-11-15T00:00:00Z"),
			},
		]);
	});

	test("refuses a delivery signed with another secret", async () => {
		const response = await delivery(
			{ type: "customer.state_changed", data: {} },
			"whsec_someone-else",
		);
		expect(response.status).toBe(401);
	});

	test("acknowledges events it does not act on", async () => {
		const response = await delivery({
			type: "order.paid",
			timestamp: new Date().toISOString(),
			data: {},
		});
		expect(response.status).toBe(204);
	});

	test("acknowledges a customer without an external id", async () => {
		const response = await delivery({
			type: "customer.state_changed",
			timestamp: new Date().toISOString(),
			data: { external_id: null },
		});
		expect(response.status).toBe(204);
	});

	test("is mounted on the app", async () => {
		const { createApp } = await import("./app");
		expect(
			createApp().router.static["/api/webhooks/polar"]?.POST,
		).toBeDefined();
	});
});
