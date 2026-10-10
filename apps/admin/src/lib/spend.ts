/**
 * Display rules for the weekly budget card and the spend-per-streamer tile.
 * Pure functions so the thresholds are unit-tested rather than eyeballed.
 */

export const BUDGET_FEATURES = [
	{ key: "all", label: "All hosted spend" },
	{ key: "tts", label: "Hosted TTS" },
	{ key: "subtitles", label: "Subtitles" },
	{ key: "audio_isolation", label: "Audio isolation" },
	{ key: "encoder", label: "Relay encoder" },
] as const;

export type BudgetFeature = (typeof BUDGET_FEATURES)[number]["key"];

export function budgetFeatureLabel(feature: string) {
	return (
		BUDGET_FEATURES.find((entry) => entry.key === feature)?.label ?? feature
	);
}

/** Below this share of the budget spend is fine; up to 100 % it is a warning. */
export const BUDGET_WARN_PCT = 80;

export type BudgetTone = "ok" | "warn" | "over" | "none";

/**
 * spent ÷ budget in percent, the same rule as `admin.spend.budgets.status`:
 * null without a known spend or a budget, and for spend over a 0 budget. The
 * card recomputes it so an optimistic budget edit shows its effect at once.
 */
export function budgetPct(spentEur: number | null, budgetEur: number | null) {
	if (spentEur === null || budgetEur === null) return null;
	if (budgetEur === 0) return spentEur === 0 ? 0 : null;
	return (spentEur / budgetEur) * 100;
}

/**
 * Tone of a week's spend against its budget: green below 80 %, amber from
 * 80 % up to and including 100 %, red above. Spend over a 0 budget is over
 * (the API sends no pct for it); unknown spend or no budget has no tone.
 */
export function budgetTone(
	spentEur: number | null,
	budgetEur: number | null,
	pct: number | null,
): BudgetTone {
	if (spentEur === null || budgetEur === null) return "none";
	if (pct === null) return budgetEur === 0 && spentEur > 0 ? "over" : "none";
	if (pct > 100) return "over";
	if (pct >= BUDGET_WARN_PCT) return "warn";
	return "ok";
}

export const BUDGET_TONE_BAR: Record<BudgetTone, string> = {
	ok: "bg-success",
	warn: "bg-amber-500",
	over: "bg-destructive",
	none: "bg-muted-foreground/40",
};

/** Progress bar width in percent: the pct, capped at a full bar. */
export function budgetBarWidth(tone: BudgetTone, pct: number | null) {
	if (tone === "over") return 100;
	if (pct === null) return 0;
	return Math.max(0, Math.min(100, pct));
}

/**
 * Parses a budget typed into the EUR field: plain or comma decimals, at
 * most cents, never negative. Returns null for anything else so the Save
 * button can stay disabled instead of sending a value the API rejects.
 */
export function parseBudgetEur(text: string): number | null {
	const normalized = text.trim().replace(",", ".");
	if (!/^\d{1,10}(\.\d{0,2})?$/.test(normalized)) return null;
	const value = Number(normalized);
	return Number.isFinite(value) ? value : null;
}

/** Why a week's spend is unknown, for the "—" cell's tooltip. */
export function unknownSpendReason(feature: string) {
	return feature === "encoder"
		? "Relay encoder time has no unit price yet"
		: "Usage in this week has no unit_price in effect";
}
