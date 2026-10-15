import { env } from "@VISP/env/server";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import { createPolar, createPolarCore } from "@polar-sh/sdk/2026-10";

export { webhooks as polarWebhooks } from "@polar-sh/sdk/2026-10";

/** Checkout slug for the one Plus product: POST /api/auth/checkout {slug}. */
export const PLUS_SLUG = "plus";

export function polarConfigured() {
	return Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_PRODUCT_ID);
}

function options() {
	return {
		accessToken: env.POLAR_ACCESS_TOKEN ?? "",
		environment: env.POLAR_SERVER,
	};
}

/** The typed API, for the webhook handler and the daily plan sync. */
export const polarApi = polarConfigured() ? createPolar(options()) : null;

/**
 * Checkout and the customer portal are Polar-hosted pages; VISP renders no
 * billing forms. Customers are keyed by external id = user id, created by the
 * first checkout, so sign-up creates nothing in Polar.
 */
export function polarPlugins() {
	if (!polarConfigured() || !env.POLAR_PRODUCT_ID) return [];
	return [
		polar({
			client: createPolarCore(options()),
			use: [
				checkout({
					products: [{ productId: env.POLAR_PRODUCT_ID, slug: PLUS_SLUG }],
					successUrl: `${env.CORS_ORIGIN}/dashboard?plus=1`,
					returnUrl: `${env.CORS_ORIGIN}/dashboard`,
					authenticatedUsersOnly: true,
				}),
				portal({ returnUrl: `${env.CORS_ORIGIN}/dashboard` }),
			],
		}),
	];
}
