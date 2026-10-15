import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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
	ai_moderator: "AI moderator",
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
	if (feature === "ai_moderator") return `${Math.round(units / 1000)}k tokens`;
	return `${(units / 3600).toFixed(1)} h`;
}

/**
 * Checkout and the portal are Polar-hosted pages, reached through the Better
 * Auth Polar plugin on the server. Web only; the apps never link to them.
 */
async function openPolar(kind: "checkout" | "portal") {
	const { data, error } = await authClient.$fetch<{ url: string }>(
		kind === "checkout" ? "/checkout" : "/customer/portal",
		{
			method: "POST",
			body: kind === "checkout" ? { slug: "plus", redirect: false } : {},
		},
	);
	if (error || !data?.url) {
		toast.error("Billing is unavailable right now. Try again in a minute.");
		return;
	}
	window.location.assign(data.url);
}

/** One shared affiliate line wherever a price or upgrade is offered. */
export function AffiliateNote() {
	const t = useT();
	const fi = useLocale() === "fi";
	return (
		<Text color="secondary" type="supporting">
			{t(
				"Creators with an audience can apply to the Affiliate program and get every feature free.*",
			)}{" "}
			<a className="underline" href={fi ? "/fi/affiliate" : "/affiliate"}>
				{t("Apply")}
			</a>{" "}
			{t("* Plus quotas apply.")}
		</Text>
	);
}

export function UpgradeButton() {
	const t = useT();
	return (
		<Button
			label={t("Upgrade to Plus · €9/mo")}
			size="sm"
			onClick={() => void openPolar("checkout")}
		/>
	);
}

export function usePlan() {
	const trpc = useTRPC();
	return useQuery(trpc.plan.me.queryOptions());
}

/**
 * Polar's checkout returns to /dashboard?plus=1. Re-read the plan from Polar
 * right away instead of waiting for the webhook, which may never arrive.
 */
function useSyncAfterCheckout() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { mutate } = useMutation(
		trpc.plan.sync.mutationOptions({
			onSettled: () =>
				queryClient.invalidateQueries(trpc.plan.me.queryFilter()),
		}),
	);
	useEffect(() => {
		if (new URLSearchParams(window.location.search).get("plus") === "1") {
			mutate();
		}
	}, [mutate]);
}

/** The one plan line on Home: Free, Plus with renewal, or Plus (Affiliate). */
export function PlanLine() {
	const t = useT();
	const locale = useLocale();
	useSyncAfterCheckout();
	const plan = usePlan().data;
	if (!plan) return null;
	const label = plan.comped
		? t("Plus (Affiliate)")
		: plan.plan === "plus"
			? `Plus${plan.periodEnd ? ` · ${t("renews")} ${day(plan.periodEnd, locale)}` : ""}`
			: t("Free plan");
	return (
		<VStack gap={1}>
			<HStack gap={2} vAlign="center" wrap="wrap">
				<Text color="secondary" type="supporting">
					{label}
				</Text>
				{plan.canCheckout ? <UpgradeButton /> : null}
				{plan.canManage ? (
					<Button
						label={t("Manage plan")}
						size="sm"
						variant="ghost"
						onClick={() => void openPolar("portal")}
					/>
				) : null}
			</HStack>
			{plan.canCheckout ? <AffiliateNote /> : null}
		</VStack>
	);
}

/** The only past-due notice: one banner at the top of the dashboard. */
export function PastDueBanner() {
	const t = useT();
	const plan = usePlan().data;
	if (plan?.status !== "past_due") return null;
	return (
		<Banner
			description={t("Update your card to keep Plus.")}
			status="warning"
			title={t("Payment failed")}
			endContent={
				plan.canManage ? (
					<Button
						label={t("Update card")}
						size="sm"
						onClick={() => void openPolar("portal")}
					/>
				) : undefined
			}
		/>
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
					{plan.canCheckout ? (
						<VStack gap={1}>
							<HStack>
								<UpgradeButton />
							</HStack>
							<AffiliateNote />
						</VStack>
					) : null}
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
