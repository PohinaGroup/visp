import "./test-env";

import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

const { billingRoutes } = await import("./billing");

const SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "";

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
