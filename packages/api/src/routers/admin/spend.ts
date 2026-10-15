import { db } from "@VISP/db";
import {
	SPEND_BUDGET_FEATURES,
	type SpendBudgetFeature,
	spendBudget,
	user,
} from "@VISP/db/schema/index";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAdminAudit } from "../../admin-audit";
import { adminProcedure, router } from "../../index";
import { deltaPct, kpisInput } from "./metrics-kpis";
import {
	bucketOf,
	floorToBucket,
	instant,
	streamSessionsSql,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";
import { priceInEffectSql } from "./usage";

/**
 * Spend efficiency and spend control for the Usage page and the Overview:
 * hosted spend per active streamer (a KPI tile) and weekly EUR budgets per
 * feature, compared against what each ISO week actually cost.
 *
 * Spend follows `admin.usage.hostedSeries`: every account counts (it is a
 * real provider invoice), cost is units × the price in effect at
 * `occurred_at` (`priceInEffectSql`), and usage without a price adds nothing
 * rather than being guessed. Relay encoder time has no unit price, so its
 * spend is always unknown (null) even though a budget can be set for it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Weeks `budgets.status` reports: the current ISO week and the 4 before. */
export const BUDGET_STATUS_WEEKS = 5;

/** Largest value `numeric(12, 2)` holds. */
const MAX_WEEKLY_EUR = 9_999_999_999.99;

const HOSTED_BUDGET_FEATURES = new Set<SpendBudgetFeature>([
	"tts",
	"subtitles",
	"audio_isolation",
]);

const num = (value: unknown) => Number(value ?? 0);

/**
 * EUR of hosted usage from row counts, with the same rule as
 * `hostedSeries.totalCostEur`: 0 without usage, null when there is usage but
 * none of it is priced (unknown, not free), otherwise the priced part.
 */
function spendOf(usageRows: number, pricedRows: number, costEur: number) {
	if (usageRows === 0) return 0;
	return pricedRows === 0 ? null : costEur;
}

/** A half-open `[from, to)` window; null stands for "no window". */
type Window = { from: Date; to: Date } | null;

/** The part of `[from, to)` live-based KPIs cover (`METRICS_DATA_START` on). */
function liveWindow(from: Date, to: Date): Window {
	const start = from < METRICS_DATA_START ? METRICS_DATA_START : from;
	return start < to ? { from: start, to } : null;
}

type WindowSpend = {
	value: number | null;
	totalCostEur: number | null;
	activeStreamers: number | null;
	pricedShare: number | null;
};

const NO_WINDOW: WindowSpend = {
	value: null,
	totalCostEur: null,
	activeStreamers: null,
	pricedShare: null,
};

/**
 * Hosted spend and active streamers over one window, and their ratio. The
 * window is the live window on both sides of the ratio, so a range reaching
 * back before `METRICS_DATA_START` does not divide older spend by streamers
 * that could not be counted yet.
 */
async function windowSpend(w: Window): Promise<WindowSpend> {
	if (!w) return NO_WINDOW;
	const { rows } = await db.execute<{
		usage_rows: unknown;
		priced_rows: unknown;
		cost_eur: unknown;
		streamers: unknown;
	}>(sql`
		with usage as (
			select h.units * price.eur_per_unit as cost
			from hosted_usage h
			${priceInEffectSql()}
			where h.occurred_at >= ${instant(w.from)}
				and h.occurred_at < ${instant(w.to)}
		)
		select
			(select count(*) from usage)::int as usage_rows,
			(select count(cost) from usage)::int as priced_rows,
			(select coalesce(sum(cost), 0) from usage)::float8 as cost_eur,
			(select count(distinct ls.user_id)
				from (${streamSessionsSql({ from: w.from, to: w.to })}) ls
			)::int as streamers
	`);
	const row = rows[0];
	if (!row) throw new Error("spend query returned no row");
	const usageRows = num(row.usage_rows);
	const pricedRows = num(row.priced_rows);
	const totalCostEur = spendOf(usageRows, pricedRows, num(row.cost_eur));
	const activeStreamers = num(row.streamers);
	return {
		value:
			totalCostEur === null || activeStreamers === 0
				? null
				: totalCostEur / activeStreamers,
		totalCostEur,
		activeStreamers,
		pricedShare: usageRows === 0 ? null : pricedRows / usageRows,
	};
}

export type BudgetStatus = {
	feature: SpendBudgetFeature;
	/** Monday 00:00 UTC of the ISO week, as an ISO instant. */
	week: string;
	/** EUR spent in the week; null when unknown (unpriced usage, encoder). */
	spentEur: number | null;
	/** The feature's current weekly budget; null when none is set. */
	budgetEur: number | null;
	/**
	 * spent ÷ budget in percent units (80 = 80%); null without a budget or a
	 * known spend, and for spend over a 0 budget (over, but not by a ratio).
	 */
	pct: number | null;
};

function budgetPct(spentEur: number | null, budgetEur: number | null) {
	if (spentEur === null || budgetEur === null) return null;
	if (budgetEur === 0) return spentEur === 0 ? 0 : null;
	return (spentEur / budgetEur) * 100;
}

const featureInput = z.enum(SPEND_BUDGET_FEATURES);

/** Audit target of a budget: one setting per feature. */
const budgetTargetId = (feature: SpendBudgetFeature) =>
	`spend_budget:${feature}`;

export const adminSpendRouter = router({
	/**
	 * Hosted spend per active streamer: priced hosted spend (every account)
	 * ÷ active streamers (eligible users with a stream session that started
	 * in the window, docs/admin-kpis.md), for the range
	 * and the optional comparison. Both sides are clamped to
	 * `METRICS_DATA_START`, like every live-based KPI.
	 *
	 * Input is `admin.metrics.kpis`'s: half-open ISO `from`/`to`, optional
	 * `compareFrom`/`compareTo`. `value`/`previous` are null when the window
	 * is empty after clamping, nothing in it has a price (`totalCostEur`
	 * null: "no prices set"), or nobody streamed. `deltaPct` (percent units)
	 * is null without a comparison, when either value is null or the
	 * previous is 0, and when the comparison starts before the data start.
	 * `totalCostEur`, `activeStreamers` and `pricedShare` (priced ÷ all
	 * usage rows, as in `hostedSeries`) describe the current window.
	 */
	perStreamer: adminProcedure.input(kpisInput).query(async ({ input }) => {
		const current = liveWindow(new Date(input.from), new Date(input.to));
		const previous =
			input.compareFrom && input.compareTo
				? liveWindow(new Date(input.compareFrom), new Date(input.compareTo))
				: null;
		const [now, before] = await Promise.all([
			windowSpend(current),
			windowSpend(previous),
		]);
		const comparable =
			input.compareFrom != null &&
			new Date(input.compareFrom) >= METRICS_DATA_START;
		return {
			value: now.value,
			previous: before.value,
			deltaPct: deltaPct(now.value, before.value, comparable),
			totalCostEur: now.totalCostEur,
			activeStreamers: now.activeStreamers,
			pricedShare: now.pricedShare,
			dataStart: METRICS_DATA_START.toISOString(),
		};
	}),

	budgets: router({
		/** Every budget feature in fixed order, with its budget or null. */
		list: adminProcedure.query(async () => {
			const rows = await db
				.select({
					feature: spendBudget.feature,
					weeklyEur: spendBudget.weeklyEur,
					updatedBy: spendBudget.updatedBy,
					updatedByName: user.name,
					updatedAt: spendBudget.updatedAt,
				})
				.from(spendBudget)
				.leftJoin(user, eq(user.id, spendBudget.updatedBy))
				.orderBy(asc(spendBudget.feature));
			const byFeature = new Map(rows.map((row) => [row.feature, row]));
			return SPEND_BUDGET_FEATURES.map((feature) => {
				const row = byFeature.get(feature);
				return {
					feature,
					weeklyEur: row ? Number(row.weeklyEur) : null,
					updatedBy: row?.updatedBy ?? null,
					updatedByName: row?.updatedByName ?? null,
					updatedAt: row ? row.updatedAt.toISOString() : null,
				};
			});
		}),

		/**
		 * Sets a feature's weekly budget (EUR, rounded to cents). Audited as
		 * `spend_budget_set` on target `setting` / `spend_budget:<feature>`
		 * in the same transaction; setting the value it already has is a no-op
		 * and writes nothing.
		 */
		set: adminProcedure
			.input(
				z.object({
					feature: featureInput,
					weeklyEur: z.number().finite().min(0).max(MAX_WEEKLY_EUR),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const weeklyEur = (Math.round(input.weeklyEur * 100) / 100).toFixed(2);
				return db.transaction(async (tx) => {
					const [previous] = await tx
						.select({ weeklyEur: spendBudget.weeklyEur })
						.from(spendBudget)
						.where(eq(spendBudget.feature, input.feature))
						.for("update");
					const before = previous ? Number(previous.weeklyEur) : null;
					const after = Number(weeklyEur);
					if (before === after) {
						return { feature: input.feature, weeklyEur: after, changed: false };
					}
					await tx
						.insert(spendBudget)
						.values({
							feature: input.feature,
							weeklyEur,
							updatedBy: ctx.session.user.id,
						})
						.onConflictDoUpdate({
							target: spendBudget.feature,
							set: {
								weeklyEur,
								updatedBy: ctx.session.user.id,
								updatedAt: sql`now()`,
							},
						});
					await writeAdminAudit(
						{
							actorId: ctx.session.user.id,
							targetType: "setting",
							targetId: budgetTargetId(input.feature),
							action: "spend_budget_set",
							before: before === null ? null : { weekly_eur: before },
							after: { weekly_eur: after },
						},
						tx,
					);
					return { feature: input.feature, weeklyEur: after, changed: true };
				});
			}),

		/**
		 * Removes a feature's budget. Audited as `spend_budget_clear`; clearing
		 * a feature without a budget is a no-op and writes nothing.
		 */
		clear: adminProcedure
			.input(z.object({ feature: featureInput }))
			.mutation(async ({ ctx, input }) => {
				return db.transaction(async (tx) => {
					const [removed] = await tx
						.delete(spendBudget)
						.where(eq(spendBudget.feature, input.feature))
						.returning({ weeklyEur: spendBudget.weeklyEur });
					if (!removed) return { feature: input.feature, changed: false };
					await writeAdminAudit(
						{
							actorId: ctx.session.user.id,
							targetType: "setting",
							targetId: budgetTargetId(input.feature),
							action: "spend_budget_clear",
							before: { weekly_eur: Number(removed.weeklyEur) },
						},
						tx,
					);
					return { feature: input.feature, changed: true };
				});
			}),

		/**
		 * Spend vs budget per feature (`all` = the whole hosted bill) for the
		 * current ISO week (UTC, Monday 00:00, so far) and the 4 weeks before
		 * it: `BUDGET_STATUS_WEEKS × features` rows, oldest week first,
		 * features in `SPEND_BUDGET_FEATURES` order. Every week is compared
		 * with today's budget, since only the current value is stored.
		 * Encoder spend is always null (no unit price for relay time).
		 */
		status: adminProcedure.query(async () => {
			const currentWeek = floorToBucket(new Date(), "week");
			const first = new Date(
				currentWeek.getTime() - (BUDGET_STATUS_WEEKS - 1) * WEEK_MS,
			);
			const end = new Date(currentWeek.getTime() + WEEK_MS);
			const [usage, budgets] = await Promise.all([
				db.execute<{
					week: Date | string;
					feature: string;
					usage_rows: unknown;
					priced_rows: unknown;
					cost_eur: unknown;
				}>(sql`
					select ${bucketOf("week", sql`h.occurred_at`)} as week, h.feature,
						count(*)::int as usage_rows,
						count(price.eur_per_unit)::int as priced_rows,
						coalesce(sum(h.units * price.eur_per_unit), 0)::float8 as cost_eur
					from hosted_usage h
					${priceInEffectSql()}
					where h.occurred_at >= ${instant(first)}
						and h.occurred_at < ${instant(end)}
					group by 1, 2
				`),
				db
					.select({
						feature: spendBudget.feature,
						weeklyEur: spendBudget.weeklyEur,
					})
					.from(spendBudget),
			]);
			const budgetOf = new Map(
				budgets.map((row) => [row.feature, Number(row.weeklyEur)]),
			);

			type Tally = { usageRows: number; pricedRows: number; costEur: number };
			const tallies = new Map<string, Tally>();
			const add = (key: string, row: (typeof usage.rows)[number]) => {
				const tally = tallies.get(key) ?? {
					usageRows: 0,
					pricedRows: 0,
					costEur: 0,
				};
				tally.usageRows += num(row.usage_rows);
				tally.pricedRows += num(row.priced_rows);
				tally.costEur += num(row.cost_eur);
				tallies.set(key, tally);
			};
			for (const row of usage.rows) {
				const week = new Date(row.week).toISOString();
				add(`${week}:${row.feature}`, row);
				add(`${week}:all`, row);
			}

			const statuses: BudgetStatus[] = [];
			for (let index = 0; index < BUDGET_STATUS_WEEKS; index++) {
				const week = new Date(first.getTime() + index * WEEK_MS).toISOString();
				for (const feature of SPEND_BUDGET_FEATURES) {
					let spentEur: number | null = null;
					if (feature === "all" || HOSTED_BUDGET_FEATURES.has(feature)) {
						const tally = tallies.get(`${week}:${feature}`);
						spentEur = tally
							? spendOf(tally.usageRows, tally.pricedRows, tally.costEur)
							: 0;
					}
					const budgetEur = budgetOf.get(feature) ?? null;
					statuses.push({
						feature,
						week,
						spentEur,
						budgetEur,
						pct: budgetPct(spentEur, budgetEur),
					});
				}
			}
			return statuses;
		}),
	}),
});
