/**
 * The rules behind `admin.alerts.list` (the Overview "Needs attention" panel)
 * as pure functions over already-loaded numbers, so every threshold boundary
 * is unit-tested without a database and the router stays a few queries.
 *
 * This file imports no database code on purpose: the admin app imports
 * `SUCCESS_RATE_TARGET` from here so the Reliability chart's target line and
 * the alert rule can never disagree.
 */
import type { RelayForecast } from "../../relay-forecast";

/** The share of Direct sessions that should reach live (Reliability target). */
export const SUCCESS_RATE_TARGET = 0.95;

/**
 * Relay capacity (paths vs `capacity_paths`, forwarders vs `max_forwarders`)
 * in percent: a relay this full needs a look before the next streamer is
 * turned away. Inclusive (`>=`).
 */
export const RELAY_CAPACITY_WARNING_PCT = 80;
export const RELAY_CAPACITY_CRITICAL_PCT = 95;
/** Window the live-path / forwarder peaks are read over. */
export const RELAY_CAPACITY_PEAK_WINDOW_MS = 60 * 60 * 1000;

/** Relay disk use in percent (latest `relay_health`). Inclusive. */
export const RELAY_DISK_WARNING_PCT = 80;
export const RELAY_DISK_CRITICAL_PCT = 90;

/**
 * A health report older than this means the relay's health timer (or the
 * relay) is down. Same rule as the Relays page (`pages/relays.tsx`): strictly
 * older than 2 minutes, i.e. four missed ~30 s pushes.
 */
export const RELAY_HEALTH_STALE_MS = 2 * 60 * 1000;

/** Forecast to reach 80 % in fewer than this many weeks warns (exclusive). */
export const RELAY_FORECAST_WARNING_WEEKS = 4;

/** Session success is judged over this trailing window. */
export const SESSION_SUCCESS_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * Fewer Direct sessions than this in the window raise nothing: at 3 sessions
 * one failure is 67 %, which is noise, not an incident.
 */
export const SESSION_SUCCESS_MIN_SESSIONS = 10;
/**
 * Below the target warns; below target minus this many percentage points is
 * critical. Both strict (`<`): exactly on a threshold is the milder level.
 */
export const SESSION_SUCCESS_CRITICAL_MARGIN_PP = 10;

/** This ISO week's spend vs its budget, in percent. Inclusive. */
export const SPEND_WARNING_PCT = 80;
export const SPEND_CRITICAL_PCT = 100;

export type AlertSeverity = "critical" | "warning";

export const ALERT_KINDS = [
	"relay_stale",
	"relay_disk",
	"relay_capacity",
	"relay_forwarders",
	"relay_forecast",
	"session_success",
	"spend_budget",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export type AdminAlert = {
	/** Stable across reads (`<kind>:<subject>`), usable as a React key. */
	id: string;
	severity: AlertSeverity;
	kind: AlertKind;
	title: string;
	detail: string;
	/** Admin route that shows the underlying numbers. */
	href: string;
	/** When the condition started, where that is known (ISO). */
	since?: string;
};

const pct = (value: number) => `${Math.round(value)} %`;

const plural = (count: number, one: string, many = `${one}s`) =>
	`${count} ${count === 1 ? one : many}`;

/** One relay as the rules see it; health fields null when it never reported. */
export type RelayAlertInput = {
	relayId: number;
	name: string;
	capacityPaths: number;
	maxForwarders: number;
	/** Paths currently assigned (not revoked). */
	assignedPaths: number;
	/** Highest `live_paths` sample in the peak window; null without samples. */
	peakLivePaths: number | null;
	/** Highest `active_forwarders` sample in the peak window; null without. */
	peakForwarders: number | null;
	/** Latest `relay_health.reported_at`; null when the relay never reported. */
	reportedAt: Date | null;
	/** Disk used % from the latest report; null when it never reported. */
	diskUsedPct: number | null;
};

function capacitySeverity(usedPct: number): AlertSeverity | null {
	if (usedPct >= RELAY_CAPACITY_CRITICAL_PCT) return "critical";
	if (usedPct >= RELAY_CAPACITY_WARNING_PCT) return "warning";
	return null;
}

/**
 * Rules 1 and 2 for one enabled relay: path and forwarder capacity, disk,
 * and a stale (or missing) health report.
 *
 * Paths count the larger of assigned and peak-live: assignment is the
 * commitment (every assigned streamer may go live at once), peak-live catches
 * a relay that is busier than its assignments suggest. Forwarders have no
 * lasting assignment (reservations last seconds), so only the peak counts.
 */
export function relayAlerts(input: RelayAlertInput, now: Date): AdminAlert[] {
	const alerts: AdminAlert[] = [];
	const { relayId, name } = input;

	if (input.capacityPaths > 0) {
		const used = Math.max(input.assignedPaths, input.peakLivePaths ?? 0);
		const usedPct = (used / input.capacityPaths) * 100;
		const severity = capacitySeverity(usedPct);
		if (severity) {
			alerts.push({
				id: `relay_capacity:${relayId}`,
				severity,
				kind: "relay_capacity",
				title: `${name}: path capacity at ${pct(usedPct)}`,
				detail: `${used} of ${input.capacityPaths} paths (${input.assignedPaths} assigned, peak ${input.peakLivePaths ?? 0} live in the last hour).`,
				href: "/relays",
			});
		}
	}

	if (input.maxForwarders > 0 && input.peakForwarders !== null) {
		const usedPct = (input.peakForwarders / input.maxForwarders) * 100;
		const severity = capacitySeverity(usedPct);
		if (severity) {
			alerts.push({
				id: `relay_forwarders:${relayId}`,
				severity,
				kind: "relay_forwarders",
				title: `${name}: forwarders at ${pct(usedPct)}`,
				detail: `Peak ${input.peakForwarders} of ${plural(input.maxForwarders, "forwarder")} in the last hour.`,
				href: "/relays",
			});
		}
	}

	if (input.reportedAt === null) {
		alerts.push({
			id: `relay_stale:${relayId}`,
			severity: "critical",
			kind: "relay_stale",
			title: `${name}: no health report`,
			detail: "Enabled, but the relay has never reported its health.",
			href: "/relays",
		});
	} else if (
		now.getTime() - input.reportedAt.getTime() >
		RELAY_HEALTH_STALE_MS
	) {
		const minutes = Math.floor(
			(now.getTime() - input.reportedAt.getTime()) / 60_000,
		);
		alerts.push({
			id: `relay_stale:${relayId}`,
			severity: "critical",
			kind: "relay_stale",
			title: `${name}: health report is stale`,
			detail: `Last report ${plural(minutes, "minute")} ago; reports are expected every 30 s.`,
			href: "/relays",
			since: input.reportedAt.toISOString(),
		});
	}

	if (input.diskUsedPct !== null) {
		const severity: AlertSeverity | null =
			input.diskUsedPct >= RELAY_DISK_CRITICAL_PCT
				? "critical"
				: input.diskUsedPct >= RELAY_DISK_WARNING_PCT
					? "warning"
					: null;
		if (severity) {
			alerts.push({
				id: `relay_disk:${relayId}`,
				severity,
				kind: "relay_disk",
				title: `${name}: disk ${pct(input.diskUsedPct)} full`,
				detail: "From the latest health report.",
				href: "/relays",
			});
		}
	}
	return alerts;
}

/**
 * Rule 3: a capacity forecast (`forecastRelayCapacity`) reaching 80 % in
 * under `RELAY_FORECAST_WARNING_WEEKS`. A relay already at 80 % has no
 * forecast (`weeksTo80Pct` null) and is rule 1's business instead.
 */
export function forecastAlerts(input: {
	relayId: number;
	name: string;
	paths: RelayForecast;
	forwarders: RelayForecast;
}): AdminAlert[] {
	const alerts: AdminAlert[] = [];
	for (const [resource, forecast] of [
		["paths", input.paths],
		["forwarders", input.forwarders],
	] as const) {
		const weeks = forecast.weeksTo80Pct;
		if (weeks === null || weeks >= RELAY_FORECAST_WARNING_WEEKS) continue;
		const days = Math.max(1, Math.round(weeks * 7));
		alerts.push({
			id: `relay_forecast:${input.relayId}:${resource}`,
			severity: "warning",
			kind: "relay_forecast",
			title: `${input.name}: ${resource} reach 80 % in ~${plural(days, "day")}`,
			detail: `Linear trend of daily peaks over ${plural(forecast.points, "day")}${forecast.confidence === "low" ? " (low confidence)" : ""}.`,
			href: "/relays",
		});
	}
	return alerts;
}

/**
 * Rule 4: Direct-session success rate over the trailing window. Nothing
 * below `SESSION_SUCCESS_MIN_SESSIONS` sessions.
 */
export function sessionSuccessAlert(
	{ started, live }: { started: number; live: number },
	target = SUCCESS_RATE_TARGET,
): AdminAlert | null {
	if (started < SESSION_SUCCESS_MIN_SESSIONS) return null;
	// `live * 100 < started * pct` rather than `live / started < target -
	// 0.1`: 0.95 - 0.1 is 0.8499… in floating point, which would make exactly
	// 85 % read as "not below 85 %" only by accident.
	const ratePct = (live / started) * 100;
	const targetPct = Math.round(target * 10_000) / 100;
	const criticalPct = targetPct - SESSION_SUCCESS_CRITICAL_MARGIN_PP;
	if (live * 100 >= started * targetPct) return null;
	return {
		id: "session_success",
		severity: live * 100 < started * criticalPct ? "critical" : "warning",
		kind: "session_success",
		title: `Session success ${pct(ratePct)} in the last 24 h`,
		detail: `${live} of ${plural(started, "Direct session")} reached live; target ${pct(targetPct)}.`,
		href: "/reliability",
	};
}

/** Spend budget features as the Usage page names them. */
const SPEND_FEATURE_LABELS: Record<string, string> = {
	all: "All hosted spend",
	tts: "Hosted TTS",
	subtitles: "Subtitles",
	audio_isolation: "Audio isolation",
	encoder: "Relay encoder",
};

const eur = (value: number) => `€${value.toFixed(2)}`;

/**
 * Rule 5: one feature's spend this ISO week against its budget (a row of
 * `admin.spend.budgets.status`). Unknown spend or no budget raises nothing;
 * any spend over a 0 budget is critical (over, though not by a ratio).
 */
export function spendAlert(status: {
	feature: string;
	week: string;
	spentEur: number | null;
	budgetEur: number | null;
	pct: number | null;
}): AdminAlert | null {
	const { spentEur, budgetEur } = status;
	if (spentEur === null || budgetEur === null) return null;
	const overZero = budgetEur === 0 && spentEur > 0;
	if (status.pct === null && !overZero) return null;
	const share = status.pct ?? Number.POSITIVE_INFINITY;
	const severity: AlertSeverity | null =
		share >= SPEND_CRITICAL_PCT
			? "critical"
			: share >= SPEND_WARNING_PCT
				? "warning"
				: null;
	if (!severity) return null;
	const label = SPEND_FEATURE_LABELS[status.feature] ?? status.feature;
	return {
		id: `spend_budget:${status.feature}`,
		severity,
		kind: "spend_budget",
		title:
			severity === "critical"
				? `${label} over weekly budget`
				: `${label} near weekly budget`,
		detail: overZero
			? `${eur(spentEur)} spent this week against a ${eur(0)} budget.`
			: `${eur(spentEur)} of ${eur(budgetEur)} (${pct(share)}) spent this ISO week.`,
		href: "/usage",
		since: status.week,
	};
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
	critical: 0,
	warning: 1,
};

/**
 * Critical first, then by rule (`ALERT_KINDS` order: relay down before relay
 * full before trends), then by id so the order is stable between reads.
 */
export function sortAlerts(alerts: readonly AdminAlert[]): AdminAlert[] {
	return [...alerts].sort(
		(a, b) =>
			SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
			ALERT_KINDS.indexOf(a.kind) - ALERT_KINDS.indexOf(b.kind) ||
			a.id.localeCompare(b.id, "en", { numeric: true }),
	);
}
