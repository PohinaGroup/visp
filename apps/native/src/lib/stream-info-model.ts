export type StreamInfoDraft = {
	title: string;
	categoryName: string;
	twitchCategoryId?: string;
	kickCategoryId?: number;
};

export function parseStreamInfoDraft(
	raw: string | null,
): StreamInfoDraft | undefined {
	if (!raw) return undefined;
	try {
		const value = JSON.parse(raw) as Partial<StreamInfoDraft>;
		if (
			typeof value.title !== "string" ||
			typeof value.categoryName !== "string"
		)
			return undefined;
		return {
			title: value.title,
			categoryName: value.categoryName,
			twitchCategoryId:
				typeof value.twitchCategoryId === "string"
					? value.twitchCategoryId
					: undefined,
			kickCategoryId:
				typeof value.kickCategoryId === "number"
					? value.kickCategoryId
					: undefined,
		};
	} catch {
		return undefined;
	}
}

export type StreamInfoUpdateResult = {
	provider: "twitch" | "kick" | "youtube";
	ok: boolean;
	error?: string;
};

export const PROVIDER_LABELS = {
	twitch: "Twitch",
	kick: "Kick",
	youtube: "YouTube",
} as const;

export function summarizeUpdateResults(results: StreamInfoUpdateResult[]) {
	if (results.length === 0) return "No linked platform to update";
	const updated = results
		.filter((result) => result.ok)
		.map((result) => PROVIDER_LABELS[result.provider]);
	const failures = results
		.filter((result) => !result.ok)
		.map((result) =>
			result.error === "consent-required"
				? `${PROVIDER_LABELS[result.provider]} needs authorization`
				: `${PROVIDER_LABELS[result.provider]} update failed`,
		);
	return [
		...(updated.length > 0 ? [`Updated on ${updated.join(" and ")}`] : []),
		...failures,
	].join(" · ");
}

export type CategorySuggestion = {
	name: string;
	twitchCategoryId?: string;
	kickCategoryId?: number;
};

export function mergeCategorySuggestions(
	twitch: Array<{ id: string; name: string }> | null,
	kick: Array<{ id: number; name: string }> | null,
	limit = 6,
): CategorySuggestion[] {
	const merged = new Map<string, CategorySuggestion>();
	for (const { id, name } of twitch ?? []) {
		merged.set(name.toLowerCase(), { name, twitchCategoryId: id });
	}
	for (const { id, name } of kick ?? []) {
		const existing = merged.get(name.toLowerCase());
		if (existing) existing.kickCategoryId = id;
		else merged.set(name.toLowerCase(), { name, kickCategoryId: id });
	}
	return [...merged.values()].slice(0, limit);
}
