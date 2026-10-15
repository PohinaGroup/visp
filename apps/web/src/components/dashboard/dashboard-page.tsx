import { formatLinkStats } from "@VISP/api/link-stats";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
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
import { type ChainSlot, SignalChain } from "@/components/signal-chain";
import { WhepPreview } from "@/components/studio/whep-preview";
import { trackEvent } from "@/lib/analytics";
import { dashboardHomeState } from "@/lib/dashboard-home";
import { useLocale, useT } from "@/lib/i18n";
import { pollWithBackoff } from "@/lib/query-resilience";
import { useTRPC } from "@/utils/trpc";
import { BrbCard } from "./brb-card";
import { ChatBotCard } from "./chat-bot-card";
import { ConnectionsCard } from "./connections-card";
import { CredentialsCard } from "./credentials-card";
import { DestinationsSummary, DirectCard } from "./direct-card";
import { GuidanceCard } from "./guidance-card";
import { ObsControlCard } from "./obs-control-card";
import { PastDueBanner, PlanLine, PlanUsageSection } from "./plan-card";
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
		trpc.direct.list.queryOptions(undefined, pollWithBackoff(3000)),
	);
	const pathsQuery = useQuery(
		trpc.paths.list.queryOptions(undefined, pollWithBackoff(5000)),
	);
	const studioQuery = useQuery(
		trpc.studio.get.queryOptions(undefined, pollWithBackoff(30_000)),
	);
	const obsQuery = useQuery(
		trpc.obs.status.queryOptions(undefined, {
			enabled: directQuery.data?.mode === "obs",
			...pollWithBackoff(3000),
		}),
	);
	const livePath = pathsQuery.data?.find(
		(path) => path.publishing && !path.stale,
	);
	const snapshotsQuery = useQuery(
		trpc.obs.snapshots.queryOptions(undefined, {
			enabled: Boolean(livePath),
			...pollWithBackoff(30_000),
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

	const onAirTone = {
		live: "tally-pulse bg-tally",
		brb: "bg-caution",
		starting: "bg-caution",
		failed: "bg-caution",
		"source-connected": "bg-signal",
		ready: "bg-signal",
		"almost-ready": "border border-muted-foreground",
	}[home.status];
	const sourcePath = livePath ?? paths[0];
	const failedOutputs = outputs.filter((o) => o.state === "failed").length;
	const startingOutputs = outputs.filter(
		(o) => o.state === "starting" || o.state === "retrying",
	).length;
	const chain: ChainSlot[] = [
		{
			label: fi ? "Lähde" : "Source",
			value: sourcePath?.label ?? (fi ? "Ei laitetta" : "No device"),
			state: livePath ? "active" : sourcePath ? "set" : "open",
			signal: livePath
				? "live"
				: paths.some((path) => path.stale)
					? "caution"
					: undefined,
			status: livePath
				? fi
					? "Lähettää"
					: "Sending"
				: sourcePath
					? fi
						? "Ei yhteyttä"
						: "Offline"
					: fi
						? "Lisää laite"
						: "Add a device",
		},
		{
			label: "Relay",
			value: "VISP",
			state: "set",
			status: livePath?.linkStats ? (
				<span className="font-mono text-xs">
					{formatLinkStats(livePath.linkStats)}
				</span>
			) : undefined,
		},
		mode === "obs"
			? {
					label: fi ? "Lähtö" : "Output",
					value: "OBS",
					state: obsQuery.data?.configured ? "set" : "open",
					signal: obsQuery.data?.streaming
						? "live"
						: obsQuery.data?.connected
							? "ok"
							: obsQuery.data?.configured
								? "caution"
								: undefined,
					status: obsQuery.data?.streaming
						? t("Live")
						: obsQuery.data?.connected
							? fi
								? "Yhdistetty"
								: "Connected"
							: obsQuery.data?.configured
								? fi
									? "Ei yhteyttä"
									: "Not connected"
								: t("Pair OBS"),
				}
			: {
					label: fi ? "Lähdöt suorana" : "Outputs live",
					value: desiredDestinations
						? `${liveOutputs}/${desiredDestinations}`
						: undefined,
					state: desiredDestinations ? "set" : "open",
					signal: liveOutputs
						? "live"
						: holding || failedOutputs || startingOutputs
							? "caution"
							: undefined,
					status: liveOutputs
						? t("Live")
						: holding
							? t("BRB")
							: failedOutputs
								? t("Output failed")
								: startingOutputs
									? t("Output starting")
									: desiredDestinations
										? t("Ready")
										: t("Connect a platform"),
					onSelect: () => selectView("destinations"),
				},
	];

	return (
		<>
			<main className="app-type mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
				<PageHeader actions={modeMenu} title={t("Dashboard")} />
				{/* ponytail: TabList has no overflow handling; scroll the strip on narrow phones. */}
				<div className="-mt-2 w-full min-w-0 overflow-x-auto">
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
				<PastDueBanner />
				{statusError ? (
					<Banner
						status="warning"
						title={t("Status unavailable")}
						description={t("Showing last known state. Retrying automatically.")}
					/>
				) : null}
				{view === "home" ? (
					<div className="flex flex-col gap-10">
						{/* The desk: program monitor beside the on-air light and chain. */}
						<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
							<section
								aria-label={t("Preview")}
								className="flex min-w-0 flex-col gap-2"
							>
								<div className="flex items-center justify-between gap-4 text-muted-foreground text-xs">
									<span className="flex items-center gap-2">
										<span
											aria-hidden
											className={`size-2 ${livePath ? "tally-pulse bg-tally" : "border border-muted-foreground"}`}
										/>
										{fi ? "Ohjelma" : "Program"}
									</span>
									{livePath ? <span>{livePath.label}</span> : null}
								</div>
								<div className="border border-border">
									<WhepPreview
										emptyHint={t(
											livePath
												? "Waiting for a picture from your camera."
												: "Preview appears when you go live from the app.",
										)}
										emptyTitle={t(
											livePath ? "Waiting for the live picture" : "No picture",
										)}
										label={
											livePath
												? `${livePath.label}: ${t("Live")}`
												: t("Preview")
										}
										poster={snapshot?.url ?? undefined}
										url={
											livePath ? studioQuery.data?.preview?.camera : undefined
										}
									/>
								</div>
							</section>

							<div className="flex min-w-0 flex-col gap-8">
								<div className="flex flex-col gap-3" role="status">
									<span className="flex items-center gap-3">
										<span
											aria-hidden
											className={`size-4 shrink-0 ${onAirTone}`}
										/>
										<span className="font-bold font-display text-5xl uppercase leading-none tracking-tight">
											{t(statusLabel)}
										</span>
									</span>
									<p className="text-muted-foreground leading-relaxed">
										{t(statusDescription)}
									</p>
								</div>
								<HStack gap={2} wrap="wrap">
									<Button
										isDisabled={statusError}
										isLoading={
											stopDirect.isPending || setObsStreaming.isPending
										}
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
								{!statusError && home.nextStep ? (
									<p className="border-muted-foreground border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed">
										{t(
											home.nextStep === "connect-platform"
												? "Authorize Twitch, Kick, or YouTube before show day."
												: home.nextStep === "get-app"
													? "Install VISP and add this phone as a publishing device."
													: "Pair the VISP plugin with OBS before you stream.",
										)}
									</p>
								) : null}
								<SignalChain
									label={fi ? "Signaaliketju" : "Signal chain"}
									slots={chain}
								/>
								<PlanLine />
							</div>
						</div>
						{mode !== "obs" ? (
							<div className="max-w-[960px]">
								<DestinationsSummary
									onManage={() => selectView("destinations")}
								/>
							</div>
						) : null}
					</div>
				) : null}
				<div className="w-full max-w-[960px]">
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
							<Card>
								<PlanUsageSection {...section("plan")} />
							</Card>
							<AgentsCard />
						</VStack>
					) : null}
				</div>
			</main>
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
