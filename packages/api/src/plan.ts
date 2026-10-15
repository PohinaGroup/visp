import { db } from "@VISP/db";
import { appUser, hostedUsage } from "@VISP/db/schema/index";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * Free + Plus (docs/plans-and-billing.md). A feature is entitled by the Polar
 * plan, an admin comp, or a legacy per-feature override; Plus quotas apply to
 * all three, so comped spend stays bounded and visible on the Usage page.
 */
export const PLAN_FEATURES = [
	"tts",
	"subtitles",
	"audio_isolation",
	"brb_highlights",
	"typography_export",
	"obs_backup",
	"ai_moderator",
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/**
 * Monthly Plus quotas in `hosted_usage` units, per calendar month UTC. Initial
 * values, tuned from per-user spend on the admin Usage page. Highlights (5
 * clips) and OBS backup (10 backups, 5 GiB) are stock limits enforced where they live.
 * The AI moderator is metered in model tokens, input and output summed.
 */
export const PLUS_QUOTAS = {
	tts: 300_000,
	subtitles: 20 * 3600,
	audio_isolation: 20 * 3600,
	typography_export: 10,
	ai_moderator: 2_000_000,
} as const satisfies Partial<Record<PlanFeature, number>>;
type MeteredFeature = keyof typeof PLUS_QUOTAS;
type MonthUsage = Record<MeteredFeature, number>;

const NO_USAGE: MonthUsage = {
	tts: 0,
	subtitles: 0,
	audio_isolation: 0,
	typography_export: 0,
	ai_moderator: 0,
};

export type PlanOwner = {
	plan: string;
	comped: boolean;
	betterTts: boolean;
	betterAudioIsolation: boolean;
	betterSubtitles: boolean;
	brbHighlights: boolean;
};

/** Early-access flags from before plans; typography and backup have none. */
const OVERRIDES: Partial<Record<PlanFeature, keyof PlanOwner>> = {
	tts: "betterTts",
	subtitles: "betterSubtitles",
	audio_isolation: "betterAudioIsolation",
	brb_highlights: "brbHighlights",
};

export function isEntitled(owner: PlanOwner, feature: PlanFeature) {
	const override = OVERRIDES[feature];
	return (
		owner.plan === "plus" ||
		owner.comped ||
		(override !== undefined && owner[override] === true)
	);
}

/** Free streams carry the VISP mark; Plus and comps don't. Overrides alone don't lift it. */
export function showsWatermark(owner: PlanOwner | null) {
	return !(owner?.plan === "plus" || owner?.comped);
}

/** The same rule for highlights, inside queries that already read app_user. */
export const highlightsEntitledSql = sql<boolean>`(${appUser.plan} = 'plus' or ${appUser.comped} or ${appUser.brbHighlights})`;
/** The AI moderator has no legacy override: plan or comp only. */
export const moderatorEntitledSql = sql<boolean>`(${appUser.plan} = 'plus' or ${appUser.comped})`;

export function monthStart(now = new Date()) {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now = new Date()) {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "1 Nov", for "Monthly quota used, resets 1 Nov". */
export function resetLabel(now = new Date()) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(nextMonthStart(now));
}

export function quotaUsedMessage(now = new Date()) {
	return `Monthly quota used, resets ${resetLabel(now)}`;
}

export async function planOwner(userId: string) {
	const [owner] = await db
		.select({
			plan: appUser.plan,
			planStatus: appUser.planStatus,
			planPeriodEnd: appUser.planPeriodEnd,
			comped: appUser.comped,
			betterTts: appUser.betterTts,
			betterAudioIsolation: appUser.betterAudioIsolation,
			betterSubtitles: appUser.betterSubtitles,
			brbHighlights: appUser.brbHighlights,
		})
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	return owner ?? null;
}

/**
 * This month's recorded usage per metered feature. Usage still in the
 * in-process buffer (up to one flush) is not counted; that overrun is accepted.
 */
export async function monthUsage(userId: string, now = new Date()) {
	const rows = await db
		.select({
			feature: hostedUsage.feature,
			units: sql<string>`sum(${hostedUsage.units})`,
		})
		.from(hostedUsage)
		.where(
			and(
				eq(hostedUsage.userId, userId),
				gte(hostedUsage.occurredAt, monthStart(now)),
			),
		)
		.groupBy(hostedUsage.feature);
	const used = { ...NO_USAGE };
	for (const row of rows) {
		if (row.feature in used)
			used[row.feature as MeteredFeature] = Number(row.units);
	}
	return used;
}

export type Entitlement = {
	/** Plan, comp or override allows the feature at all. */
	entitled: boolean;
	/** Entitled and, for metered features, quota left this month. */
	allowed: boolean;
	/** Units left this month; null for features without a monthly quota. */
	remaining: number | null;
};

export function entitlementFrom(
	owner: PlanOwner | null,
	feature: PlanFeature,
	used: MonthUsage,
): Entitlement {
	if (!owner || !isEntitled(owner, feature)) {
		return { entitled: false, allowed: false, remaining: 0 };
	}
	if (!(feature in PLUS_QUOTAS)) {
		return { entitled: true, allowed: true, remaining: null };
	}
	const metered = feature as MeteredFeature;
	const remaining = Math.max(0, PLUS_QUOTAS[metered] - used[metered]);
	return { entitled: true, allowed: remaining > 0, remaining };
}

export async function entitlement(
	userId: string,
	feature: PlanFeature,
	now = new Date(),
): Promise<Entitlement> {
	const owner = await planOwner(userId);
	if (!owner || !isEntitled(owner, feature) || !(feature in PLUS_QUOTAS)) {
		return entitlementFrom(owner, feature, NO_USAGE);
	}
	return entitlementFrom(owner, feature, await monthUsage(userId, now));
}

/**
 * What the read-aloud, isolation and caption settings may offer: `chat.speech`
 * keeps its pre-plan shape so shipped apps keep working.
 */
export async function speechAvailability(userId: string, now = new Date()) {
	const [owner, used] = await Promise.all([
		planOwner(userId),
		monthUsage(userId, now),
	]);
	return {
		betterTts: entitlementFrom(owner, "tts", used).allowed,
		betterAudioIsolation: entitlementFrom(owner, "audio_isolation", used)
			.allowed,
		betterSubtitles: entitlementFrom(owner, "subtitles", used).allowed,
	};
}

/** For gates that throw: typography export and OBS backup. */
export class PlanError extends Error {}

export async function requireEntitlement(
	userId: string,
	feature: PlanFeature,
	label: string,
	now = new Date(),
) {
	const result = await entitlement(userId, feature, now);
	if (!result.entitled) throw new PlanError(`${label} is part of Plus`);
	if (!result.allowed) throw new PlanError(quotaUsedMessage(now));
	return result;
}
