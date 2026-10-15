import { VStack } from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { DetailSection, type DetailSectionState } from "./detail-section";
import type { PlanView } from "./types";

type PlanFeature = PlanView["features"][number];

const FEATURE_LABELS: Record<PlanFeature["feature"], string> = {
	tts: "Hosted voice",
	subtitles: "Live captions",
	audio_isolation: "Audio isolation",
	brb_highlights: "BRB highlights",
	typography_export: "Typography export",
	obs_backup: "OBS backup",
};

/** Limits that are not monthly, shown as text instead of a bar. */
const STOCK_LIMITS: Partial<Record<PlanFeature["feature"], string>> = {
	brb_highlights: "5 clips",
	obs_backup: "10 backups, 5 GB in total",
};

function day(iso: string, locale: string) {
	return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(iso));
}

function amount(feature: PlanFeature["feature"], units: number) {
	if (feature === "tts") return `${Math.round(units / 1000)}k characters`;
	if (feature === "typography_export") return `${units}`;
	return `${(units / 3600).toFixed(1)} h`;
}

function usePlan() {
	const trpc = useTRPC();
	return useQuery(trpc.plan.me.queryOptions());
}

/** The one plan line on Home: Free, Plus with renewal, or Plus (Affiliate). */
export function PlanLine() {
	const t = useT();
	const locale = useLocale();
	const plan = usePlan().data;
	if (!plan) return null;
	const label = plan.comped
		? t("Plus (Affiliate)")
		: plan.plan === "plus"
			? `Plus${plan.periodEnd ? ` · ${t("renews")} ${day(plan.periodEnd, locale)}` : ""}`
			: t("Free plan");
	return (
		<Text color="secondary" type="supporting">
			{label}
		</Text>
	);
}

export function PlanUsageSection(open: DetailSectionState) {
	const t = useT();
	const locale = useLocale();
	const plan = usePlan().data;
	return (
		<DetailSection
			{...open}
			id="dashboard-plan"
			tag={t("Plan")}
			title={t("Plan and usage")}
			value="plan"
		>
			{plan ? (
				<VStack gap={3}>
					<Text color="secondary" type="supporting">
						{t("Monthly quotas reset on")} {day(plan.resetsAt, locale)}.
					</Text>
					{plan.features.map((row) => {
						const label = t(FEATURE_LABELS[row.feature]);
						const stock = STOCK_LIMITS[row.feature];
						if (!row.entitled) {
							return (
								<Text key={row.feature} type="supporting">
									{label}: {t("Plus")}
								</Text>
							);
						}
						if (row.quota === null || row.remaining === null) {
							return (
								<Text key={row.feature} type="supporting">
									{label}: {stock ? t(stock) : t("included")}
								</Text>
							);
						}
						const used = row.quota - row.remaining;
						return (
							<ProgressBar
								formatValueLabel={() =>
									`${amount(row.feature, used)} / ${amount(row.feature, row.quota ?? 0)}`
								}
								hasValueLabel
								key={row.feature}
								label={label}
								max={row.quota}
								value={used}
								variant={row.allowed ? "accent" : "warning"}
							/>
						);
					})}
				</VStack>
			) : (
				<Text color="secondary">{t("Loading plan…")}</Text>
			)}
		</DetailSection>
	);
}
