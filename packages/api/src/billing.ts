import { polarApi } from "@VISP/auth/polar";
import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { tryAdvisoryLock } from "./advisory-lock";

export type PlanState = {
	plan: "free" | "plus";
	status: "active" | "past_due" | null;
	periodEnd: Date | null;
};

type PolarSubscription = {
	status: string;
	product_id: string;
	current_period_end: string | null;
};

/** Statuses that keep Plus. Past due keeps it for all of Polar's retries. */
const PLUS_STATUSES = ["active", "trialing", "past_due"] as const;

/**
 * Plus while any subscription to the Plus product is active, trialing or past
 * due; free otherwise. Cancel at period end stays active until Polar ends it.
 */
export function planFromSubscriptions(
	subscriptions: PolarSubscription[],
	productId: string,
): PlanState {
	const live = subscriptions.find(
		(subscription) =>
			subscription.product_id === productId &&
			(PLUS_STATUSES as readonly string[]).includes(subscription.status),
	);
	if (!live) return { plan: "free", status: null, periodEnd: null };
	return {
		plan: "plus",
		status: live.status === "past_due" ? "past_due" : "active",
		periodEnd: live.current_period_end
			? new Date(live.current_period_end)
			: null,
	};
}

/**
 * Re-reads the user's Plus subscriptions from Polar. Webhooks only say "look
 * again", so handling is idempotent and order-insensitive, and a past-due
 * subscription is seen whether or not Polar's customer state lists it.
 */
export async function fetchPlan(userId: string): Promise<PlanState> {
	if (!polarApi || !env.POLAR_PRODUCT_ID) {
		throw new Error("Polar is not configured");
	}
	const page = await polarApi.subscriptions.list({
		external_customer_id: userId,
		product_id: env.POLAR_PRODUCT_ID,
		status: [...PLUS_STATUSES],
		limit: 10,
	});
	return planFromSubscriptions(page.items, env.POLAR_PRODUCT_ID);
}

/** Writes Polar's columns only; `comped` is the admin's and never touched. */
export async function applyPlan(
	userId: string,
	state: PlanState,
	conn: Pick<typeof db, "update"> = db,
) {
	const [row] = await conn
		.update(appUser)
		.set({
			plan: state.plan,
			planStatus: state.status,
			planPeriodEnd: state.periodEnd,
		})
		.where(eq(appUser.id, userId))
		.returning({ id: appUser.id });
	return Boolean(row);
}

/**
 * Read and write under one per-user lock, so a webhook racing the periodic
 * sync (or another delivery) cannot land an older "free" over a newer "plus".
 */
export async function syncUserPlan(userId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`plan:${userId}`}))`,
		);
		return applyPlan(userId, await fetchPlan(userId), tx);
	});
}

/** A renewal webhook this late has been missed. */
const STALE_PERIOD_MS = 3 * 24 * 60 * 60_000;
export const PLAN_SYNC_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Guard against a missed renewal webhook: Plus users whose period ended more
 * than three days ago are re-read from Polar. One instance runs it at a time.
 * A missed first-payment webhook is covered by `plan.sync` from the dashboard.
 */
export async function syncPlans(now = new Date()) {
	if (!polarApi) return null;
	const lock = await tryAdvisoryLock("plan-sync");
	if (!lock) return null;
	try {
		const stale = await db
			.select({ id: appUser.id })
			.from(appUser)
			.where(
				and(
					eq(appUser.plan, "plus"),
					lt(appUser.planPeriodEnd, new Date(now.getTime() - STALE_PERIOD_MS)),
				),
			);
		for (const { id } of stale) {
			try {
				await syncUserPlan(id);
			} catch (error) {
				console.error("Plan sync failed for a user", error);
			}
		}
		return stale.length;
	} finally {
		await lock.release();
	}
}
