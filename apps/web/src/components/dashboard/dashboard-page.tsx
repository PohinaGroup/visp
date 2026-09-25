import { formatLinkStats } from "@VISP/api/link-stats";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import {
	DropdownMenu,
	DropdownMenuItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentsCard } from "@/components/auth/agent-auth/agents-card";
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
import { DestinationsSummary, DirectCard } from "./direct-card";
import { GuidanceCard } from "./guidance-card";
import { ObsControlCard } from "./obs-control-card";
import { PublishingDevicesCard } from "./publishing-devices-card";
import { SetupCard } from "./setup-card";
import {
	DASHBOARD_VIEWS,
	type DashboardView,
	type DetailSectionId,
} from "./types";
import {
	seppoToolActivityLabel,
	useDashboardSeppo,
} from "./use-dashboard-seppo";

function viewFromHash(): DashboardView {
	if (typeof window === "undefined") return "home";
	const hash = window.location.hash.slice(1);
	// Old bookmarks and emails point at the single #settings page.
	if (hash === "settings") return "destinations";
	return DASHBOARD_VIEWS.find((view) => view === hash) ?? "home";
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
		window.history.replaceState(null, "", next === "home" ? "#" : `#${next}`);
	};
	useEffect(() => {
		const sync = () => setView(viewFromHash());
		window.addEventListener("hashchange", sync);
		return () => window.removeEventListener("hashchange", sync);
	}, []);
	const openTab = (next: DashboardView, target?: string) => {
		selectView(next);
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
	const outputs = [
		...(direct?.destinations ?? []),
		...(direct?.customOutputs ?? []),
	];
	const holding = outputs.find((output) => output.state === "brb");
	const liveOutputs = outputs.filter(
		(output) => output.state === "live",
	).length;
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
		startingOutputs: outputs.filter(
			(o) => o.state === "starting" || o.state === "retrying",
		).length,
		failedOutputs: outputs.filter((o) => o.state === "failed").length,
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
			case "inspect-output":
			case "connect-platform":
			case "pair-obs":
				openTab(
					"destinations",
					home.primaryAction === "pair-obs" ? "obs-control" : undefined,
				);
				break;
			case "get-app":
			case "open-app":
				navigate({ to: "/download", search: fi ? { lang: "fi" } : {} });
				break;
			case "end-stream": {
				const pathId =
					holding?.pathId ??
					livePath?.id ??
					outputs.find(
						(output) =>
							output.state === "live" ||
							output.state === "starting" ||
							output.state === "retrying",
					)?.pathId;
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
		"inspect-output": t("Check output settings"),
		"connect-platform": t("Connect a platform"),
		"get-app": t("Get the VISP app"),
		"open-app": t("Open the app to go live"),
		"end-stream": t("End stream"),
		"pair-obs": t("Pair OBS"),
		"start-obs": t("Start OBS stream"),
		"stop-obs": t("Stop OBS stream"),
	}[home.primaryAction];

	const statusQueries = [
		directQuery,
		pathsQuery,
		...(direct?.mode === "obs" ? [obsQuery] : []),
	];
	const statusError = statusQueries.some((query) => query.isError);
	const statusMissing = statusQueries.some((query) => query.data === undefined);
	const statusLabel = {
		"almost-ready": "Almost ready",
		ready: "Ready",
		live: "Live",
		brb: "BRB",
		"source-connected": "Camera connected",
		starting: "Output starting",
		failed: "Output failed",
	}[home.status];
	const statusDescription = {
		"almost-ready": "Finish the next step below.",
		ready: "Everything is ready for your next stream.",
		live: "Your stream is on air.",
		brb: "Your ingest dropped. Viewers see your BRB card.",
		"source-connected": "Your camera is connected. No platform output is live.",
		starting: "Connecting to your platform. Your broadcast is not live yet.",
		failed: "Your platform output failed. Check the output details below.",
	}[home.status];
	if (statusMissing)
		return (
			<Card>
				<Heading level={2}>
					{t(statusError ? "Status unavailable" : "Loading stream status…")}
				</Heading>
				<Text>
					{t(
						statusError
							? "Could not load your stream status. Retrying automatically."
							: "Please wait.",
					)}
				</Text>
			</Card>
		);

	const mode = direct?.mode ?? "unconfigured";
	const modeLabel = {
		direct: t("Mode: Direct"),
		obs: t("Mode: OBS"),
		unconfigured: t("Mode: not set"),
	}[mode];
	const modeMenu = (
		<DropdownMenu
			button={{
				label: `${modeLabel} · ${t("change")}`,
				size: "sm",
				variant: "ghost",
				isDisabled: setOperationalMode.isPending,
			}}
			placement="below"
		>
			<DropdownMenuItem
				description={t(
					"Your phone streams straight to Twitch, Kick, or YouTube.",
				)}
				isDisabled={mode === "direct"}
				label={t("Phone to platform")}
				onClick={() => chooseOperationalMode("direct")}
			/>
			<DropdownMenuItem
				description={t("Your phone sends video to OBS on your computer.")}
				isDisabled={mode === "obs"}
				label={t("Phone to your OBS")}
				onClick={() => chooseOperationalMode("obs")}
			/>
		</DropdownMenu>
	);
	const tabs: Array<{ value: DashboardView; label: string }> = [
		{ value: "home", label: t("Home") },
		{
			value: "destinations",
			label: mode === "obs" ? "OBS" : t("Destinations"),
		},
		{ value: "devices", label: t("Devices") },
		{ value: "safety", label: t("BRB") },
		{ value: "chat", label: t("Chat") },
		{ value: "advanced", label: t("Advanced") },
	];

	return (
		<>
			<Center axis="horizontal" style={{ minWidth: 0 }}>
				<VStack
					gap={5}
					maxWidth={960}
					padding={4}
					style={{ minWidth: 0 }}
					width="100%"
				>
					<PageHeader
						actions={modeMenu}
						eyebrow={t("Show day")}
						title={t("Dashboard")}
					/>
					{/* ponytail: TabList has no overflow handling; scroll the strip on narrow phones. */}
					<div className="w-full min-w-0 overflow-x-auto">
						<TabList
							hasDivider
							value={view}
							onChange={(next) => selectView(next as DashboardView)}
						>
							{tabs.map((tab) => (
								<Tab key={tab.value} label={tab.label} value={tab.value} />
							))}
						</TabList>
					</div>
					{statusError ? (
						<Banner
							status="warning"
							title={t("Status unavailable")}
							description={t(
								"Showing last known state. Retrying automatically.",
							)}
						/>
					) : null}
					{view === "home" ? (
						<VStack gap={4} width="100%">
							<Card>
								<VStack gap={1}>
									<Heading level={2}>{t(statusLabel)}</Heading>
									<Text color="secondary">{t(statusDescription)}</Text>
									{livePath?.linkStats ? (
										<Text color="secondary">
											{formatLinkStats(livePath.linkStats)}
										</Text>
									) : null}
								</VStack>
							</Card>
							{!statusError && home.nextStep ? (
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
							<HStack gap={2} wrap="wrap">
								<Button
									isDisabled={statusError}
									isLoading={stopDirect.isPending || setObsStreaming.isPending}
									label={actionLabel}
									variant="primary"
									onClick={primaryAction}
								/>
								{studioQuery.data?.settings.available ? (
									<Button
										href={`/studio${fi ? "?lang=fi" : ""}`}
										label={t("Cloud Studio")}
									/>
								) : null}
							</HStack>
							<Card>
								<VStack gap={2}>
									<Heading level={2}>{t("Preview")}</Heading>
									{livePath ? (
										<WhepPreview
											emptyHint={t("Waiting for a picture from your camera.")}
											emptyTitle={t("Waiting for the live picture")}
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
							{mode !== "obs" ? (
								<DestinationsSummary
									onManage={() => selectView("destinations")}
								/>
							) : null}
						</VStack>
					) : null}
					{view === "destinations" ? (
						<VStack gap={4} width="100%">
							{mode === "obs" ? (
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
								<>
									<DirectCard advanced />
									{/* OBS can still read the Direct feed for monitoring or recording. */}
									<Card>
										<CredentialsCard {...section("obs-read")} />
									</Card>
								</>
							)}
						</VStack>
					) : null}
					{view === "devices" ? (
						<PublishingDevicesCard
							onRedoSetup={() =>
								navigate({
									to: "/setup",
									search: { lang: fi ? "fi" : undefined, redo: true },
								})
							}
						/>
					) : null}
					{view === "safety" ? <BrbCard /> : null}
					{view === "chat" ? (
						<VStack gap={4} width="100%">
							<div id="dashboard-connections">
								<ConnectionsCard />
							</div>
							<ChatBotCard />
						</VStack>
					) : null}
					{view === "advanced" ? (
						<VStack gap={4} width="100%">
							<Card>
								<GuidanceCard {...section("tuning")} />
							</Card>
							<AgentsCard />
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
