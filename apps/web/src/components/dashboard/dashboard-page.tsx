import { formatLinkStats } from "@VISP/api/link-stats";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SeppoWidget } from "@/components/seppo-widget";
import { WhepPreview } from "@/components/studio/whep-preview";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { BrbCard } from "./brb-card";
import { ChainStrip } from "./chain-strip";
import { ChatBotCard } from "./chat-bot-card";
import { ConnectionsCard } from "./connections-card";
import { CredentialsCard } from "./credentials-card";
import { DetailSection } from "./detail-section";
import { DirectCard } from "./direct-card";
import { GuidanceCard } from "./guidance-card";
import { ObsControlCard } from "./obs-control-card";
import { PublishingDevicesCard } from "./publishing-devices-card";
import { SetupCard } from "./setup-card";
import type { DashboardTab, DetailSectionId } from "./types";
import {
	seppoToolActivityLabel,
	useDashboardSeppo,
} from "./use-dashboard-seppo";

function isTab(value: string): value is DashboardTab {
	return (
		value === "sources" ||
		value === "output" ||
		value === "brb" ||
		value === "chat"
	);
}

// The tab lives in the hash so a reload — or the round trip through a
// platform's OAuth consent screen — comes back to the panel you were on.
function tabFromHash(): DashboardTab {
	if (typeof window === "undefined") return "sources";
	const hash = window.location.hash.replace("#", "");
	return isTab(hash) ? hash : "sources";
}

export function DashboardPage() {
	const t = useT();
	const locale = useLocale();
	const fi = locale === "fi";
	const trpc = useTRPC();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const directQuery = useQuery(trpc.direct.list.queryOptions());
	const pathsQuery = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);
	const livePath = pathsQuery.data?.find(
		(path) => path.publishing && !path.stale,
	);
	const snapshotsQuery = useQuery(
		trpc.obs.snapshots.queryOptions(undefined, {
			enabled: Boolean(livePath),
			refetchInterval: 30_000,
		}),
	);
	const studioQuery = useQuery(
		trpc.studio.get.queryOptions(undefined, { refetchInterval: 30_000 }),
	);
	const obsQuery = useQuery(
		trpc.obs.status.queryOptions(undefined, {
			enabled: directQuery.data?.mode === "obs",
			refetchInterval: 3000,
		}),
	);
	const setOperationalMode = useMutation(
		trpc.direct.setMode.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Primary mode saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const stopDirect = useMutation(
		trpc.brb.stop.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Ending the stream"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const stopObs = useMutation(
		trpc.obs.setStreaming.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const [tab, setTab] = useState<DashboardTab>(tabFromHash);
	const selectTab = (next: DashboardTab) => {
		setTab(next);
		window.history.replaceState(null, "", `#${next}`);
	};
	const {
		open: seppoOpen,
		setOpen: setSeppoOpen,
		openSections,
		setOpenSections,
		handleToolCall,
	} = useDashboardSeppo(selectTab);

	const operationalMode = directQuery.data?.mode;
	const isDirect = operationalMode === "direct";
	const snapshot = snapshotsQuery.data?.find(
		(entry) => entry.pathId === livePath?.id,
	);
	const tabs: { value: DashboardTab; label: string }[] = [
		{ value: "sources", label: t("Sources") },
		{ value: "output", label: t("Output") },
		...(isDirect ? [{ value: "brb" as const, label: t("BRB screen") }] : []),
		{ value: "chat", label: t("Chat") },
	];
	const active = tabs.some((entry) => entry.value === tab) ? tab : "sources";

	// Open/close wiring for a collapsed detail section, so Seppo can open one.
	const section = (id: DetailSectionId) => ({
		isOpen: openSections.includes(id),
		onOpenChange: (isOpen: boolean) =>
			setOpenSections((current) =>
				isOpen
					? [...new Set([...current, id])]
					: current.filter((entry) => entry !== id),
			),
	});

	const chooseOperationalMode = (value: string) => {
		if (value === "direct") {
			navigate({
				to: "/setup",
				search: {
					lang: locale === "fi" ? "fi" : undefined,
					redo: true,
					redoMode: "additive",
				},
			});
			return;
		}
		if (
			operationalMode !== "direct" ||
			window.confirm(
				t(
					"Switch to Route to Home Studio? This turns off every Direct platform output.",
				),
			)
		) {
			setOperationalMode.mutate({ mode: "obs" });
		}
	};

	return (
		<>
			<Center axis="horizontal">
				<VStack gap={5} maxWidth={960} padding={4} width="100%">
					<PageHeader eyebrow={t("Live signal path")} title={t("Dashboard")} />

					{livePath ? (
						<Card>
							<div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] sm:items-end">
								<WhepPreview
									label={`${livePath.label}: ${t("Live")}`}
									poster={snapshot?.url ?? undefined}
									url={studioQuery.data?.preview?.camera}
								/>
								<VStack gap={2}>
									<VStack gap={0.5}>
										<Text weight="semibold">
											{livePath.label} · {t("Live")}
										</Text>
										{livePath.linkStats ? (
											<Text color="secondary" type="supporting">
												{formatLinkStats(livePath.linkStats)}
												{livePath.linkStats.linkDegraded
													? ` · ${t("Degraded")}`
													: ""}
												{livePath.linkStats.congested
													? ` · ${t("Congested")}`
													: ""}
											</Text>
										) : null}
									</VStack>
									{operationalMode === "direct" ? (
										<Banner
											description={t(
												"Authorization, ownership, and relay capacity checked before Go Live.",
											)}
											status="success"
											title={t("Pre-flight passed")}
										/>
									) : null}
									<Button
										isDisabled={
											!operationalMode ||
											operationalMode === "unconfigured" ||
											(operationalMode === "obs" && !obsQuery.data?.streaming)
										}
										isLoading={stopDirect.isPending || stopObs.isPending}
										label={t("End stream")}
										variant="primary"
										onClick={() =>
											operationalMode === "obs"
												? stopObs.mutate({ streaming: false })
												: stopDirect.mutate({ pathId: livePath.id })
										}
									/>
								</VStack>
							</div>
						</Card>
					) : null}

					<ChainStrip onSelect={selectTab} />

					<TabList
						hasDivider
						value={active}
						onChange={(value) => {
							if (isTab(value)) selectTab(value);
						}}
					>
						{tabs.map((entry) => (
							<Tab key={entry.value} label={entry.label} value={entry.value} />
						))}
					</TabList>

					{active === "sources" ? (
						<VStack gap={4} width="100%">
							<PublishingDevicesCard
								onRedoSetup={() =>
									navigate({
										to: "/setup",
										search: {
											lang: locale === "fi" ? "fi" : undefined,
											redo: true,
										},
									})
								}
							/>
							<Card>
								<GuidanceCard {...section("tuning")} />
							</Card>
						</VStack>
					) : null}

					{active === "output" ? (
						<VStack gap={4} width="100%">
							{studioQuery.data?.settings.available ? (
								<Card>
									<VStack gap={2}>
										<Heading level={2}>{t("Cloud Studio")}</Heading>
										<Text color="secondary" type="supporting">
											{t(
												"Build the saved program that Direct sends to your platforms.",
											)}
										</Text>
										<Button
											href={`/studio${fi ? "?lang=fi" : ""}`}
											label={t("Open Studio")}
											variant="primary"
										/>
									</VStack>
								</Card>
							) : null}

							{operationalMode === "obs" ? (
								<>
									<ObsControlCard />
									<Card>
										<VStack gap={4}>
											<CredentialsCard {...section("obs-read")} />
											<Divider />
											<SetupCard {...section("reference")} />
										</VStack>
									</Card>
								</>
							) : (
								<DirectCard />
							)}

							<Card>
								<DetailSection
									{...section("mode")}
									id="dashboard-mode"
									tag={t("Advanced setup")}
									title={t("Change publishing path")}
									value="mode"
								>
									<Text color="secondary" type="supporting">
										{t(
											"Select where the final stream is produced. These modes are separate and cannot run as one output path.",
										)}
									</Text>
									<SegmentedControl
										isDisabled={
											!operationalMode || setOperationalMode.isPending
										}
										label={t("Primary operational mode")}
										layout="fill"
										value={
											operationalMode === "unconfigured"
												? ""
												: (operationalMode ?? "")
										}
										onChange={chooseOperationalMode}
									>
										<SegmentedControlItem
											label={t("Direct to Platform")}
											value="direct"
										/>
										<SegmentedControlItem
											label={t("Route to Home Studio")}
											value="obs"
										/>
									</SegmentedControl>
								</DetailSection>
							</Card>
						</VStack>
					) : null}

					{active === "brb" ? <BrbCard /> : null}

					{active === "chat" ? (
						<VStack gap={4} width="100%">
							<ConnectionsCard />
							<ChatBotCard />
						</VStack>
					) : null}
				</VStack>
			</Center>
			<SeppoWidget
				context="dashboard"
				open={seppoOpen}
				placeholder={
					fi ? "Kysy hallintapaneelistasi…" : "Ask about your dashboard…"
				}
				subtitle={
					fi
						? "Hallintapaneelin apu — voi tarkistaa tilan ja opastaa käyttöönotossa"
						: "Dashboard help — can inspect status and guide setup"
				}
				suggestions={
					fi
						? [
								"Miksi laitteeni ei ole yhteydessä?",
								"Auta yhdistämään OBS",
								"Tarkista hallintapaneelini asetukset",
							]
						: [
								"Why is my device offline?",
								"Help me connect OBS",
								"Check my dashboard setup",
							]
				}
				welcome={
					fi
						? "Hei, olen Seppo. Voin tarkistaa hallintapaneelin turvalliset tilatiedot, selvittää signaalipolun ongelmia ja avata oikeat käyttöönoton ohjaimet."
						: "Hi, I'm Seppo. I can inspect the safe status shown on this dashboard, troubleshoot your signal path, and open the right setup controls."
				}
				onOpenChange={setSeppoOpen}
				onToolCall={handleToolCall}
				toolActivityLabel={seppoToolActivityLabel}
			/>
		</>
	);
}
