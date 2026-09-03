import { formatLinkStats } from "@VISP/api/link-stats";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SeppoWidget } from "@/components/seppo-widget";
import { WhepPreview } from "@/components/studio/whep-preview";
import { trackEvent } from "@/lib/analytics";
import { dashboardHomeState } from "@/lib/dashboard-home";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { BrbCard } from "./brb-card";
import { ChatBotCard } from "./chat-bot-card";
import { ConnectionsCard } from "./connections-card";
import { CredentialsCard } from "./credentials-card";
import { DetailSection } from "./detail-section";
import { DirectCard } from "./direct-card";
import { GuidanceCard } from "./guidance-card";
import { ObsControlCard } from "./obs-control-card";
import { PublishingDevicesCard } from "./publishing-devices-card";
import { SetupCard } from "./setup-card";
import type { DashboardView, DetailSectionId } from "./types";
import {
	seppoToolActivityLabel,
	useDashboardSeppo,
} from "./use-dashboard-seppo";

function viewFromHash(): DashboardView {
	if (typeof window === "undefined") return "home";
	return window.location.hash === "#settings" ? "settings" : "home";
}

export function DashboardPage() {
	const t = useT();
	const locale = useLocale();
	const fi = locale === "fi";
	const trpc = useTRPC();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const directQuery = useQuery(
		trpc.direct.list.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const pathsQuery = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
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
	const livePath = pathsQuery.data?.find(
		(path) => path.publishing && !path.stale,
	);
	const snapshotsQuery = useQuery(
		trpc.obs.snapshots.queryOptions(undefined, {
			enabled: Boolean(livePath),
			refetchInterval: 30_000,
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
	const setObsStreaming = useMutation(
		trpc.obs.setStreaming.mutationOptions({
			onSuccess: async () => queryClient.invalidateQueries(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const [view, setView] = useState<DashboardView>(viewFromHash);
	const selectView = (next: DashboardView) => {
		setView(next);
		window.history.replaceState(
			null,
			"",
			next === "settings" ? "#settings" : "#",
		);
	};
	const openSettings = (target?: string) => {
		selectView("settings");
		if (target) {
			window.setTimeout(
				() =>
					document
						.getElementById(target)
						?.scrollIntoView({ behavior: "smooth" }),
				100,
			);
		}
	};
	const {
		open: seppoOpen,
		setOpen: setSeppoOpen,
		openSections,
		setOpenSections,
		handleToolCall,
	} = useDashboardSeppo(selectView);

	const direct = directQuery.data;
	const paths = pathsQuery.data ?? [];
	const holding = direct?.paths.find((path) =>
		(["twitch", "kick", "youtube"] as const).some(
			(provider) => path.state[provider] === "brb",
		),
	);
	const liveOutputs = [
		...(direct?.destinations ?? []),
		...(direct?.customOutputs ?? []),
	].filter((output) => output.state === "live").length;
	const desiredDestinations = direct
		? Number(direct.desired.twitch) +
			Number(direct.desired.kick) +
			Number(direct.desired.youtube) +
			direct.customOutputs.length
		: 0;
	const home = dashboardHomeState({
		mode: direct?.mode ?? "unconfigured",
		desiredDestinations,
		liveOutputs,
		holding: Boolean(holding),
		paths,
		obs: {
			configured: Boolean(obsQuery.data?.configured),
			connected: Boolean(obsQuery.data?.connected),
			streaming: Boolean(obsQuery.data?.streaming),
		},
	});
	const snapshot = snapshotsQuery.data?.find(
		(entry) => entry.pathId === livePath?.id,
	);
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
					lang: fi ? "fi" : undefined,
					redo: true,
					redoMode: "additive",
				},
			});
			return;
		}
		if (
			direct?.mode !== "direct" ||
			window.confirm(
				t(
					"Switch to Route to Home Studio? This turns off every Direct platform output.",
				),
			)
		) {
			setOperationalMode.mutate({ mode: "obs" });
		}
	};
	const primaryAction = () => {
		trackEvent("dashboard_home_cta", { action: home.primaryAction });
		switch (home.primaryAction) {
			case "connect-platform":
			case "pair-obs": {
				const target =
					home.primaryAction === "pair-obs"
						? "obs-control"
						: "dashboard-direct";
				openSettings(target);
				break;
			}
			case "get-app":
			case "open-app":
				navigate({ to: "/download", search: fi ? { lang: "fi" } : {} });
				break;
			case "end-stream": {
				const pathId = holding?.id ?? livePath?.id;
				if (pathId) stopDirect.mutate({ pathId });
				break;
			}
			case "start-obs":
				setObsStreaming.mutate({ streaming: true });
				break;
			case "stop-obs":
				setObsStreaming.mutate({ streaming: false });
				break;
		}
	};
	const actionLabel = {
		"connect-platform": t("Connect a platform"),
		"get-app": t("Get the VISP app"),
		"open-app": t("Open the app to go live"),
		"end-stream": t("End stream"),
		"pair-obs": t("Pair OBS"),
		"start-obs": t("Start OBS stream"),
		"stop-obs": t("Stop OBS stream"),
	}[home.primaryAction];

	return (
		<>
			<Center axis="horizontal">
				<VStack gap={5} maxWidth={960} padding={4} width="100%">
					<PageHeader
						eyebrow={t(view === "settings" ? "Setup and controls" : "Show day")}
						title={t(view === "settings" ? "Settings" : "Dashboard")}
					/>
					{view === "home" ? (
						<VStack gap={4} width="100%">
							<Card>
								<VStack gap={1}>
									<Heading level={2}>
										{t(
											home.status === "live"
												? "Live"
												: home.status === "ready"
													? "Ready"
													: "Almost ready",
										)}
									</Heading>
									<Text color="secondary">
										{holding
											? t("Your ingest dropped. Viewers see your BRB card.")
											: livePath?.linkStats
												? `${formatLinkStats(livePath.linkStats)}${livePath.linkStats.linkDegraded ? ` · ${t("Degraded")}` : ""}${livePath.linkStats.congested ? ` · ${t("Congested")}` : ""}`
												: t(
														home.status === "live"
															? "Your stream is on air."
															: home.status === "ready"
																? "Everything is ready for your next stream."
																: "Finish the next step below.",
													)}
									</Text>
								</VStack>
							</Card>
							<Card>
								<VStack gap={2}>
									<Heading level={2}>{t("Preview")}</Heading>
									{livePath ? (
										<WhepPreview
											label={`${livePath.label}: ${t("Live")}`}
											poster={snapshot?.url ?? undefined}
											url={studioQuery.data?.preview?.camera}
										/>
									) : (
										<Text color="secondary">
											{t("Preview appears when you go live from the app.")}
										</Text>
									)}
								</VStack>
							</Card>
							{direct?.mode !== "obs" ? <DirectCard /> : null}
							{home.nextStep ? (
								<Banner
									description={t(
										home.nextStep === "connect-platform"
											? "Authorize Twitch, Kick, or YouTube before show day."
											: home.nextStep === "get-app"
												? "Install VISP and add this phone as a publishing device."
												: "Pair the VISP plugin with OBS before you stream.",
									)}
									status="info"
									title={t("Next step")}
								/>
							) : null}
							<Button
								isLoading={stopDirect.isPending || setObsStreaming.isPending}
								label={actionLabel}
								variant="primary"
								onClick={primaryAction}
							/>
							<HStack gap={2} wrap="wrap">
								<Button
									label={t("Chat")}
									onClick={() => openSettings("dashboard-connections")}
								/>
								{home.status === "live" && direct?.mode !== "obs" ? (
									<Button
										label={t("BRB screen")}
										onClick={() => openSettings("dashboard-brb")}
									/>
								) : null}
								{studioQuery.data?.settings.available ? (
									<Button
										href={`/studio${fi ? "?lang=fi" : ""}`}
										label={t("Cloud Studio")}
									/>
								) : null}
								<Button label={t("Settings")} onClick={() => openSettings()} />
							</HStack>
						</VStack>
					) : (
						<VStack gap={4} width="100%">
							<Button
								label={t("Back to dashboard")}
								onClick={() => selectView("home")}
							/>
							<PublishingDevicesCard
								onRedoSetup={() =>
									navigate({
										to: "/setup",
										search: { lang: fi ? "fi" : undefined, redo: true },
									})
								}
							/>
							<Card>
								<GuidanceCard {...section("tuning")} />
							</Card>
							{direct?.mode === "obs" ? (
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
								<DirectCard advanced />
							)}
							<Card>
								<DetailSection
									{...section("mode")}
									id="dashboard-mode"
									tag={t("Publishing path")}
									title={t("Where your phone sends video")}
									value="mode"
								>
									<SegmentedControl
										isDisabled={!direct?.mode || setOperationalMode.isPending}
										label={t("Primary operational mode")}
										layout="fill"
										value={
											direct?.mode === "unconfigured"
												? ""
												: (direct?.mode ?? "")
										}
										onChange={chooseOperationalMode}
									>
										<SegmentedControlItem
											label={t("Phone to platform")}
											value="direct"
										/>
										<SegmentedControlItem
											label={t("Phone to your OBS")}
											value="obs"
										/>
									</SegmentedControl>
								</DetailSection>
							</Card>
							<BrbCard />
							<div id="dashboard-connections">
								<ConnectionsCard />
							</div>
							<ChatBotCard />
						</VStack>
					)}
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
						? "Hei, olen Seppo. Voin tarkistaa tilan ja avata oikeat asetukset."
						: "Hi, I'm Seppo. I can inspect your status and open the right settings."
				}
				onOpenChange={setSeppoOpen}
				onToolCall={handleToolCall}
				toolActivityLabel={seppoToolActivityLabel}
			/>
		</>
	);
}
