import { syncUserPlan } from "@VISP/api/billing";
import { polarWebhooks as webhooks } from "@VISP/auth/polar";
import { env } from "@VISP/env/server";
import { Elysia } from "elysia";

/**
 * Polar calls this on `customer.state_changed`. The payload is only a trigger:
 * the plan is re-read from Polar, so replays and out-of-order deliveries are
 * harmless. Excluded from session auth by the `/api/webhooks/**` rule.
 */
export const billingRoutes = new Elysia({ name: "billing-routes" }).post(
	"/api/webhooks/polar",
	async ({ request, status }) => {
		if (!env.POLAR_WEBHOOK_SECRET) {
			return status(503, { error: "Billing is not configured" });
		}
		const body = await request.text();
		let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
		try {
			event = await webhooks.validateEvent(
				body,
				Object.fromEntries(request.headers),
				env.POLAR_WEBHOOK_SECRET,
			);
		} catch (error) {
			if (error instanceof webhooks.PolarWebhookVerificationError) {
				return status(401, { error: "Invalid signature" });
			}
			// Unknown event types are acknowledged so Polar stops retrying them.
			return new Response(null, { status: 204 });
		}
		if (event.type !== "customer.state_changed") {
			return new Response(null, { status: 204 });
		}
		const userId = event.data.external_id;
		if (!userId) return new Response(null, { status: 204 });
		try {
			await syncUserPlan(userId);
		} catch (error) {
			console.error("Polar plan sync failed", error);
			// 5xx makes Polar retry the delivery.
			return status(502, { error: "Plan sync failed" });
		}
		return new Response(null, { status: 204 });
	},
	{ parse: "none" },
);
