import type { AppRouter } from "@VISP/api/routers/index";
import { env } from "@VISP/env/web";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import {
	DownloadIcon,
	EyeIcon,
	LinkIcon,
	MessageCircleIcon,
	MonitorIcon,
	PlusIcon,
	PowerIcon,
	RotateCwIcon,
	Trash2Icon,
	UnlinkIcon,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	downloadSceneCollection,
	MaskedUrlWithFallback,
	RevealedValue,
	UrlWithFallback,
} from "@/components/credential-reveal";
import {
	type SeppoClientToolCall,
	SeppoWidget,
} from "@/components/seppo-widget";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { probeRelayRtt } from "@/lib/relay";
import { sanitizeDashboardStatus } from "@/lib/seppo-dashboard";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
	beforeLoad: async ({ context }) => {
		const [status, paths] = await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.secrets.status.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.paths.list.queryOptions(),
			),
		]);
		if (!status.onboardedAt && !paths.some((path) => path.publishRevealable)) {
			throw redirect({ to: "/setup", search: { redo: false } });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
	const advancedMode = statusQuery.data?.advancedMode ?? false;
	const [advancedSections, setAdvancedSections] = useState<string[]>([]);
	const [seppoOpen, setSeppoOpen] = useState(false);
	const setAdvanced = useMutation(
		trpc.secrets.setAdvancedMode.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const submitRtt = useMutation(trpc.rtt.submit.mutationOptions());

	useEffect(() => {
		if (!advancedMode) setAdvancedSections([]);
	}, [advancedMode]);

	const handleSeppoTool = async (toolCall: SeppoClientToolCall) => {
		switch (toolCall.toolName) {
			case "inspectDashboard": {
				const [secrets, paths, obs, connections] = await Promise.all([
					queryClient.fetchQuery(trpc.secrets.status.queryOptions()),
					queryClient.fetchQuery(trpc.paths.list.queryOptions()),
					queryClient.fetchQuery(trpc.obs.status.queryOptions()),
					queryClient.fetchQuery(trpc.chat.connections.list.queryOptions()),
				]);
				return JSON.stringify(
					sanitizeDashboardStatus({ secrets, paths, obs, connections }),
				);
			}
			case "showDashboardArea": {
				const { area } = toolCall.input as {
					area:
						| "devices"
						| "relay"
						| "obs"
						| "connections"
						| "tuning"
						| "setup";
				};
				const targets = {
					devices: { id: "devices" },
					obs: { id: "obs-control" },
					relay: { id: "obs-read", section: "obs-read" },
					connections: { id: "dashboard-connections", section: "chat" },
					tuning: { id: "dashboard-tuning", section: "tuning" },
					setup: { id: "dashboard-setup", section: "reference" },
				} as const;
				const target = targets[area];
				if ("section" in target) {
					if (!advancedMode) {
						await setAdvanced.mutateAsync({ advancedMode: true });
					}
					setAdvancedSections((current) =>
						current.includes(target.section)
							? current
							: [...current, target.section],
					);
				}
				window.setTimeout(
					() =>
						document
							.getElementById(target.id)
							?.scrollIntoView({ behavior: "smooth", block: "center" }),
					100,
				);
				return `Opened ${area}`;
			}
			case "setDashboardMode": {
				const { mode } = toolCall.input as {
					mode: "simple" | "advanced";
				};
				await setAdvanced.mutateAsync({ advancedMode: mode === "advanced" });
				return `Dashboard mode set to ${mode}`;
			}
			case "measureRelayConnection": {
				const { profile } = toolCall.input as {
					profile: "wired" | "wifi" | "cellular";
				};
				const rttMs = await probeRelayRtt(env.VITE_RELAY_PING_URL);
				const guidance = await submitRtt.mutateAsync({
					rttMs,
					profile,
					method: "browser-probe",
				});
				return JSON.stringify({ rttMs, ...guidance });
			}
			default:
				throw new Error(`Unsupported dashboard action: ${toolCall.toolName}`);
		}
	};

	return (
		<>
			<Center axis="horizontal">
				<VStack gap={6} maxWidth={1180} padding={4} width="100%">
					<HStack gap={6} hAlign="between" vAlign="end" wrap="wrap">
						<VStack gap={1} maxWidth={560}>
							<Text color="secondary" type="supporting">
								Signal path
							</Text>
							<Heading level={1}>Relay dashboard</Heading>
							<Text color="secondary" type="supporting">
								Devices publish to the relay, OBS reads the feeds, you go on
								air. Your provider stream key never enters VISP.
							</Text>
						</VStack>
						<VStack gap={3} hAlign="end">
							<SegmentedControl
								label="Dashboard detail level"
								value={advancedMode ? "advanced" : "simple"}
								onChange={(value) =>
									setAdvanced.mutate({ advancedMode: value === "advanced" })
								}
							>
								<SegmentedControlItem label="Simple" value="simple" />
								<SegmentedControlItem label="Advanced" value="advanced" />
							</SegmentedControl>
							<ChainStrip />
						</VStack>
					</HStack>
					<Grid columns={{ minWidth: 440, repeat: "fit" }} gap={4}>
						<PublishingDevicesCard
							onRedoSetup={() =>
								navigate({ to: "/setup", search: { redo: true } })
							}
						/>
						<VStack gap={4}>
							<ObsControlCard />
							{advancedMode ? (
								<VStack gap={2}>
									<Text color="secondary" type="supporting">
										Advanced
									</Text>
									<CollapsibleGroup
										hasDividers
										type="multiple"
										value={advancedSections}
										onChange={(value) => setAdvancedSections(value as string[])}
									>
										<CredentialsCard />
										<ConnectionsCard />
										<GuidanceCard />
										<SetupCard />
									</CollapsibleGroup>
								</VStack>
							) : null}
						</VStack>
					</Grid>
				</VStack>
			</Center>
			<SeppoWidget
				context="dashboard"
				open={seppoOpen}
				placeholder="Ask about your dashboard…"
				subtitle="Dashboard help — can inspect status and guide setup"
				suggestions={[
					"Why is my device offline?",
					"Help me connect OBS",
					"Check my dashboard setup",
				]}
				welcome="Hi, I'm Seppo. I can inspect the safe status shown on this dashboard, troubleshoot your signal path, and open the right setup controls."
				onOpenChange={setSeppoOpen}
				onToolCall={handleSeppoTool}
				toolActivityLabel={(part) => {
					switch (part.type) {
						case "tool-inspectDashboard":
							return "Dashboard status checked";
						case "tool-showDashboardArea":
							return `Opened ${String((part.input as { area?: string }).area ?? "dashboard")}`;
						case "tool-setDashboardMode":
							return `Dashboard mode: ${String((part.input as { mode?: string }).mode ?? "updated")}`;
						case "tool-measureRelayConnection":
							return "Relay connection measured";
						default:
							return null;
					}
				}}
			/>
		</>
	);
}

function AdvancedSection({
	id,
	value,
	tag,
	title,
	action,
	children,
}: {
	id?: string;
	value: string;
	tag: string;
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Collapsible
			defaultIsOpen={false}
			trigger={
				<VStack gap={0.5}>
					<Text color="secondary" id={id} type="supporting">
						{tag}
					</Text>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<Text type="label">{title}</Text>
						{action}
					</HStack>
				</VStack>
			}
			value={value}
		>
			<VStack gap={4} paddingBlock={2}>
				{children}
			</VStack>
		</Collapsible>
	);
}

type NodeState = "live" | "ok" | "warn" | "idle";

const nodeDot: Record<
	NodeState,
	{ variant: "success" | "warning" | "error" | "neutral"; pulse: boolean }
> = {
	live: { variant: "error", pulse: true },
	ok: { variant: "success", pulse: false },
	warn: { variant: "warning", pulse: false },
	idle: { variant: "neutral", pulse: false },
};

function ChainNode({
	href,
	label,
	value,
	state,
}: {
	href: string;
	label: string;
	value: string;
	state: NodeState;
}) {
	const dot = nodeDot[state];
	return (
		<ClickableCard href={href} label={`${label}: ${value}`} padding={3}>
			<VStack gap={1}>
				<HStack gap={1.5} vAlign="center">
					<StatusDot
						isPulsing={dot.pulse}
						label={label}
						variant={dot.variant}
					/>
					<Text color="secondary" type="supporting">
						{label}
					</Text>
				</HStack>
				<Text type="label">{value}</Text>
			</VStack>
		</ClickableCard>
	);
}

function ChainStrip() {
	const trpc = useTRPC();
	const secrets = useQuery(trpc.secrets.status.queryOptions());
	const obs = useQuery(
		trpc.obs.status.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);

	const total = paths.data?.length ?? 0;
	const live =
		paths.data?.filter((path) => path.publishing && !path.stale).length ?? 0;
	const readConfigured = secrets.data?.readConfigured ?? false;
	const obsStatus = obs.data;

	return (
		<HStack as="nav" gap={2} isScrollable vAlign="stretch">
			<ChainNode
				href="#devices"
				label="Sources"
				state={live > 0 ? "live" : total > 0 ? "idle" : "warn"}
				value={total === 0 ? "No devices" : `${live} of ${total} live`}
			/>
			<ChainNode
				href="#obs-read"
				label="Relay"
				state={readConfigured ? "ok" : "warn"}
				value={readConfigured ? "Keys set" : "Setup needed"}
			/>
			<ChainNode
				href="#obs-control"
				label="OBS"
				state={obsStatus?.connected ? "ok" : "idle"}
				value={obsStatus?.connected ? "Connected" : "Not connected"}
			/>
			<ChainNode
				href="#obs-control"
				label="Output"
				state={obsStatus?.streaming ? "live" : "idle"}
				value={
					obsStatus?.configured
						? obsStatus.streaming
							? "On air"
							: "Off air"
						: "Not paired"
				}
			/>
		</HStack>
	);
}

type Outputs = inferRouterOutputs<AppRouter>;
type PathView = Outputs["paths"]["list"][number];
type SecretBundle = Outputs["secrets"]["rotate"];
type CreatedDevice = Outputs["paths"]["create"]["path"];
type Guidance = Outputs["rtt"]["submit"];
type ObsPairing = Outputs["obs"]["pair"];
type SnapshotView = Outputs["obs"]["snapshots"][number];

const snapshotImage = {
	width: "100%",
	height: "100%",
	objectFit: "cover",
} as const;

function SnapshotTile({ snapshot }: { snapshot: SnapshotView }) {
	return (
		<VStack gap={2}>
			<Card padding={0} variant="muted">
				<AspectRatio ratio={16 / 9}>
					{snapshot.url ? (
						<img
							alt={`Latest snapshot from ${snapshot.label}`}
							key={snapshot.url}
							loading="lazy"
							onError={(event) => {
								event.currentTarget.hidden = true;
							}}
							src={snapshot.url}
							style={snapshotImage}
						/>
					) : (
						<Center>
							<Text color="secondary" type="supporting">
								Snapshot pending
							</Text>
						</Center>
					)}
				</AspectRatio>
			</Card>
			<HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
				<Text type="label">{snapshot.label}</Text>
				<Text color="secondary" type="supporting">
					{snapshot.capturedAt
						? `Captured ${formatUtc(snapshot.capturedAt)}`
						: "Waiting for first capture"}
				</Text>
			</HStack>
		</VStack>
	);
}

function ObsControlCard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(
		trpc.obs.status.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const snapshotsQuery = useQuery(
		trpc.obs.snapshots.queryOptions(undefined, { refetchInterval: 60_000 }),
	);
	const [pairing, setPairing] = useState<ObsPairing | null>(null);
	const pair = useMutation(
		trpc.obs.pair.mutationOptions({
			onSuccess: async (result) => {
				setPairing(result);
				await queryClient.invalidateQueries();
				toast.success("OBS pairing token created");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setStreaming = useMutation(
		trpc.obs.setStreaming.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const status = statusQuery.data;

	const downloadConfig = () => {
		if (!pairing) return;
		const serverUrl = import.meta.env.PROD
			? window.location.origin
			: env.VITE_SERVER_URL.replace(/\/$/, "");
		const contents = `[visp]\ncontrol_url=${serverUrl}/api/obs/control\ntoken=${pairing.token}\n`;
		const anchor = document.createElement("a");
		anchor.href = URL.createObjectURL(
			new Blob([contents], { type: "text/plain" }),
		);
		anchor.download = "config.ini";
		anchor.click();
		URL.revokeObjectURL(anchor.href);
	};

	return (
		<Card>
			<VStack gap={4}>
				<VStack gap={1}>
					<Text color="secondary" id="obs-control" type="supporting">
						Stage 02 · On air
					</Text>
					<HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
						<Heading level={2}>OBS</Heading>
						<HStack gap={1.5} vAlign="center">
							<StatusDot
								label={status?.connected ? "Connected" : "Disconnected"}
								variant={status?.connected ? "success" : "neutral"}
							/>
							<Text color="secondary" type="supporting">
								{status?.connected ? "Connected" : "Disconnected"}
							</Text>
						</HStack>
					</HStack>
					<Text color="secondary" type="supporting">
						Start or stop your OBS stream and watch what each live feed is
						sending. The OBS plugin is live in beta —{" "}
						<Link to="/download">download the plugin</Link>.
					</Text>
				</VStack>

				<Text color="secondary">
					{status?.configured
						? status.pending
							? "OBS has not acknowledged the latest command yet."
							: status.streaming
								? "OBS reports that the stream is live."
								: "OBS reports that the stream is stopped."
						: "OBS is not paired yet. Open plugin pairing below to connect it."}
				</Text>

				<VStack gap={2}>
					<VStack gap={0.5}>
						<Text type="label">Live stream snapshots</Text>
						<Text color="secondary" type="supporting">
							Each live feed refreshes about once per minute.
						</Text>
					</VStack>
					{snapshotsQuery.isPending ? (
						<Skeleton height={180} />
					) : snapshotsQuery.data?.length ? (
						<Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
							{snapshotsQuery.data.map((snapshot) => (
								<SnapshotTile key={snapshot.pathId} snapshot={snapshot} />
							))}
						</Grid>
					) : (
						<EmptyState
							description="Snapshots appear here when a publishing device is live."
							isCompact
							title="No live streams"
						/>
					)}
				</VStack>

				<Collapsible
					defaultIsOpen={false}
					trigger={<Text type="label">Plugin pairing</Text>}
				>
					<VStack gap={3} paddingBlock={2}>
						<Text color="secondary" type="supporting">
							Install the beta plugin from the{" "}
							<Link to="/download">download page</Link>, then generate a token
							and open Tools → VISP Remote Control in OBS. Paste the token there
							or import the downloaded config.ini. VISP stores only a one-way
							hash, and generating another token disconnects the old one.
						</Text>
						{pairing ? (
							<RevealedValue label="OBS pairing token" value={pairing.token} />
						) : null}
						<HStack gap={2} wrap="wrap">
							<Button
								icon={<Icon color="inherit" icon={MonitorIcon} size="sm" />}
								isLoading={pair.isPending}
								label={
									status?.configured
										? "Rotate pairing token"
										: "Generate pairing token"
								}
								onClick={() => {
									if (
										!status?.configured ||
										window.confirm("Replace the current OBS pairing token?")
									) {
										pair.mutate();
									}
								}}
							/>
							{pairing ? (
								<Button
									icon={<Icon color="inherit" icon={DownloadIcon} size="sm" />}
									label="Download plugin config"
									onClick={downloadConfig}
								/>
							) : null}
						</HStack>
					</VStack>
				</Collapsible>

				<HStack>
					<Button
						icon={<Icon color="inherit" icon={PowerIcon} size="sm" />}
						isDisabled={
							!status?.connected || status.pending || setStreaming.isPending
						}
						label={status?.streaming ? "Stop OBS stream" : "Start OBS stream"}
						variant="primary"
						onClick={() =>
							setStreaming.mutate({ streaming: !status?.streaming })
						}
					/>
				</HStack>
			</VStack>
		</Card>
	);
}

function ConnectionsCard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const connections = useQuery(trpc.chat.connections.list.queryOptions());
	const enable = useMutation(
		trpc.chat.connections.enable.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Chat enabled");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disable = useMutation(
		trpc.chat.connections.disable.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Chat disabled");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const link = async (provider: "twitch" | "kick", chatConsent = false) => {
		const result =
			provider === "twitch"
				? await authClient.linkSocial({
						provider,
						callbackURL: authRedirectURL("/dashboard"),
						// Twitch tokens keep only the last-requested scopes, so always
						// re-request the union or one feature's consent drops the other's.
						scopes: chatConsent
							? ["user:read:chat", "channel:manage:broadcast"]
							: undefined,
					})
				: await authClient.oauth2.link({
						providerId: provider,
						callbackURL: authRedirectURL("/dashboard"),
					});
		if (result.error)
			toast.error(result.error.message ?? `Could not link ${provider}`);
	};

	const unlink = async (provider: "twitch" | "kick", enabled: boolean) => {
		if (enabled) await disable.mutateAsync({ provider });
		const result = await authClient.unlinkAccount({ providerId: provider });
		if (result.error) {
			toast.error(result.error.message ?? `Could not unlink ${provider}`);
			return;
		}
		await queryClient.invalidateQueries();
		toast.success(`${provider === "twitch" ? "Twitch" : "Kick"} unlinked`);
	};

	const linkedCount =
		connections.data?.filter((connection) => connection.linked).length ?? 0;

	return (
		<AdvancedSection
			id="dashboard-connections"
			tag="Advanced · Chat"
			title="Connections"
			value="chat"
		>
			<Text color="secondary" type="supporting">
				Link either provider for login, then opt into its read-only live chat
				separately.
			</Text>
			{connections.data?.map((connection) => {
				const label = connection.provider === "twitch" ? "Twitch" : "Kick";
				return (
					<Card key={connection.provider} padding={3} variant="muted">
						<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
							<VStack gap={1}>
								<HStack gap={2} vAlign="center">
									<Text type="label">{label}</Text>
									<Badge
										label={connection.linked ? "Linked" : "Not linked"}
										variant="neutral"
									/>
									{connection.enabled ? (
										<Badge label="Chat on" variant="success" />
									) : null}
								</HStack>
								<Text color="secondary" type="supporting">
									{connection.enabled
										? "Messages can appear in VISP Native."
										: "Chat is disabled."}
								</Text>
							</VStack>
							<HStack gap={2} wrap="wrap">
								{!connection.linked ? (
									<Button
										icon={<Icon color="inherit" icon={LinkIcon} size="sm" />}
										label="Link"
										onClick={() => void link(connection.provider)}
									/>
								) : connection.needsConsent ? (
									<Button
										icon={
											<Icon
												color="inherit"
												icon={MessageCircleIcon}
												size="sm"
											/>
										}
										label="Authorize chat"
										variant="primary"
										onClick={() => void link("twitch", true)}
									/>
								) : connection.enabled ? (
									<Button
										isLoading={disable.isPending}
										label="Disable chat"
										onClick={() =>
											disable.mutate({ provider: connection.provider })
										}
									/>
								) : (
									<Button
										icon={
											<Icon
												color="inherit"
												icon={MessageCircleIcon}
												size="sm"
											/>
										}
										isLoading={enable.isPending}
										label="Enable chat"
										variant="primary"
										onClick={() =>
											enable.mutate({ provider: connection.provider })
										}
									/>
								)}
								{connection.linked ? (
									<Button
										icon={<Icon color="inherit" icon={UnlinkIcon} size="sm" />}
										isDisabled={linkedCount < 2 || disable.isPending}
										label="Unlink"
										variant="ghost"
										onClick={() =>
											void unlink(connection.provider, connection.enabled)
										}
									/>
								) : null}
							</HStack>
						</HStack>
					</Card>
				);
			})}
			<Text color="secondary" type="supporting">
				Disabling chat keeps the provider available for sign-in. At least one
				login must remain linked.
			</Text>
		</AdvancedSection>
	);
}

function CredentialsCard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
	const [bundle, setBundle] = useState<SecretBundle | null>(null);
	const rotate = useMutation(
		trpc.secrets.rotate.mutationOptions({
			onSuccess: async (result) => {
				setBundle(result);
				await queryClient.invalidateQueries();
				toast.success("OBS read credentials rotated");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reveal = useMutation(
		trpc.secrets.revealRead.mutationOptions({
			onSuccess: setBundle,
			onError: (error) => toast.error(error.message),
		}),
	);
	const configured = statusQuery.data?.readConfigured;
	const revealable = statusQuery.data?.readRevealable;

	const downloadScene = () => {
		if (!bundle?.sceneCollection) {
			return;
		}
		downloadSceneCollection(bundle.sceneCollection);
	};

	return (
		<AdvancedSection
			action={
				configured ? (
					<Badge label="Configured" variant="success" />
				) : (
					<Badge label="Setup required" variant="warning" />
				)
			}
			id="obs-read"
			tag="Advanced · Relay to OBS"
			title="OBS read credentials"
			value="obs-read"
		>
			<Text color="secondary" type="supporting">
				These URLs let OBS receive your feeds. Publish URLs are managed per
				device above.
			</Text>
			{bundle ? (
				<VStack gap={4}>
					<RevealedValue label="Read secret" value={bundle.revealed.read} />
					{bundle.urls.read.map((url) => (
						<VStack gap={2} key={url.slug}>
							<Text type="label">Read: {url.slug}</Text>
							<UrlWithFallback label="OBS URL" rtmp={url.rtmp} srt={url.srt} />
						</VStack>
					))}
				</VStack>
			) : (
				<Text color="secondary" type="supporting">
					{configured
						? revealable
							? "Reveal your read URLs anytime — one per device, including newly added ones. Rotating replaces the secret and breaks existing OBS sources."
							: "Read credentials from before revealing was supported can only be replaced. Rotate once to make them revealable."
						: "Generate read credentials to receive your device feeds in OBS."}
				</Text>
			)}
			<HStack gap={2} wrap="wrap">
				{configured && revealable ? (
					<Button
						icon={<Icon color="inherit" icon={EyeIcon} size="sm" />}
						isLoading={reveal.isPending}
						label="Reveal read URLs"
						variant="primary"
						onClick={() => reveal.mutate()}
					/>
				) : null}
				{configured ? (
					<Button
						icon={<Icon color="inherit" icon={RotateCwIcon} size="sm" />}
						isLoading={rotate.isPending}
						label="Rotate read"
						onClick={() => {
							if (
								!revealable ||
								window.confirm(
									"Rotate read credentials? Existing OBS sources will stop working until you update them.",
								)
							) {
								rotate.mutate({ kind: "read" });
							}
						}}
					/>
				) : (
					<Button
						isLoading={rotate.isPending}
						label="Generate OBS credentials"
						variant="primary"
						onClick={() => rotate.mutate({ kind: "read" })}
					/>
				)}
				{bundle?.sceneCollection ? (
					<Button
						icon={<Icon color="inherit" icon={DownloadIcon} size="sm" />}
						label="Download OBS collection"
						onClick={downloadScene}
					/>
				) : null}
			</HStack>
		</AdvancedSection>
	);
}

function PathStatus({ path }: { path: PathView }) {
	if (path.stale) {
		return (
			<HStack gap={1.5} vAlign="center">
				<StatusDot label="Status unknown" variant="warning" />
				<Text color="secondary" type="supporting">
					Status unknown
				</Text>
			</HStack>
		);
	}
	if (path.publishing) {
		return (
			<HStack gap={1.5} vAlign="center">
				<StatusDot isPulsing label="Live" variant="error" />
				<Text type="supporting" weight="semibold">
					Live
				</Text>
			</HStack>
		);
	}
	return (
		<HStack gap={1.5} vAlign="center">
			<StatusDot label="Offline" variant="neutral" />
			<Text color="secondary" type="supporting">
				Offline
			</Text>
		</HStack>
	);
}

function formatUtc(value: string) {
	return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

function PathRow({ path }: { path: PathView }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [label, setLabel] = useState(path.label);
	const rename = useMutation(
		trpc.paths.rename.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Device renamed");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reveal = useMutation(trpc.paths.reveal.mutationOptions());
	const revealRead = useMutation(trpc.secrets.revealRead.mutationOptions());
	const rotate = useMutation(
		trpc.paths.rotatePublish.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Publish URL rotated for this device");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const publishUrl = async (protocol: "srt" | "rtmp") =>
		(await reveal.mutateAsync({ pathId: path.id })).urls[protocol];
	const readUrl = async (protocol: "srt" | "rtmp") => {
		const url = (await revealRead.mutateAsync()).urls.read.find(
			(candidate) => candidate.slug === path.slug,
		);
		if (!url) throw new Error("Read URL is not available");
		return url[protocol];
	};
	const revoke = useMutation(
		trpc.paths.revoke.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Path revoked");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<VStack gap={2} paddingBlock={2}>
			<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
				<VStack gap={0.5}>
					<Text type="label">{path.label}</Text>
					<Text color="secondary" type="supporting">
						{path.publishLastConnectedAt
							? `Last connected ${formatUtc(path.publishLastConnectedAt)}`
							: "Never connected"}
					</Text>
				</VStack>
				<PathStatus path={path} />
			</HStack>
			{path.maskedUrls.publish ? (
				<MaskedUrlWithFallback
					getRtmp={() => publishUrl("rtmp")}
					getSrt={() => publishUrl("srt")}
					label="Sending URL"
					rtmp={path.maskedUrls.publish.rtmp}
					srt={path.maskedUrls.publish.srt}
				/>
			) : null}
			{path.maskedUrls.read ? (
				<MaskedUrlWithFallback
					getRtmp={() => readUrl("rtmp")}
					getSrt={() => readUrl("srt")}
					label="OBS read URL"
					rtmp={path.maskedUrls.read.rtmp}
					srt={path.maskedUrls.read.srt}
				/>
			) : null}
			<Collapsible
				defaultIsOpen={false}
				trigger={
					<Text color="secondary" type="supporting">
						Manage device
					</Text>
				}
			>
				<VStack gap={3} paddingBlock={2}>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<Text type="code">{path.slug}</Text>
						<Badge
							label={
								path.publishOrigin === "native"
									? "VISP Native"
									: path.publishOrigin === "web"
										? "Web"
										: "Legacy"
							}
							variant="neutral"
						/>
					</HStack>
					<HStack gap={2} vAlign="end" wrap="wrap">
						<TextInput
							label="Device name"
							size="sm"
							value={label}
							onChange={(value) => setLabel(value)}
						/>
						<Button
							isDisabled={
								rename.isPending || !label.trim() || label === path.label
							}
							label="Save"
							size="sm"
							onClick={() => rename.mutate({ pathId: path.id, label })}
						/>
					</HStack>
					<HStack gap={2} wrap="wrap">
						<Button
							icon={<Icon color="inherit" icon={RotateCwIcon} size="sm" />}
							isLoading={rotate.isPending}
							label={
								path.publishRevealable
									? "Rotate this device"
									: "Create device URL"
							}
							size="sm"
							onClick={() => {
								const warning = path.publishRevealable
									? `Rotate ${path.label}? Its current publish URL will stop working.`
									: `Create a device URL for ${path.label}? Its legacy account-wide URL will stop working on this path.`;
								if (window.confirm(warning)) {
									rotate.mutate({ pathId: path.id });
								}
							}}
						/>
						<Button
							icon={<Icon color="inherit" icon={Trash2Icon} size="sm" />}
							isLoading={revoke.isPending}
							label="Revoke"
							size="sm"
							variant="destructive"
							onClick={() => {
								if (
									window.confirm(
										`Revoke ${path.slug}? This slug can never be reused.`,
									)
								) {
									revoke.mutate({ pathId: path.id });
								}
							}}
						/>
					</HStack>
				</VStack>
			</Collapsible>
		</VStack>
	);
}

function PublishingDevicesCard({ onRedoSetup }: { onRedoSetup: () => void }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [label, setLabel] = useState("");
	const [created, setCreated] = useState<CreatedDevice | null>(null);
	const pathsQuery = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);
	const create = useMutation(
		trpc.paths.create.mutationOptions({
			onSuccess: async (result) => {
				setCreated(result.path);
				setLabel("");
				await queryClient.invalidateQueries();
				toast.success("Publishing device created");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<VStack gap={4}>
				<VStack gap={1}>
					<Text color="secondary" id="devices" type="supporting">
						Stage 01 · Sources
					</Text>
					<Heading level={2}>Publishing devices</Heading>
					<Text color="secondary" type="supporting">
						Every device has its own sending URL. Revealing or rotating one
						never affects the others.
					</Text>
				</VStack>

				{created ? (
					<Banner
						defaultIsExpanded
						status="success"
						title={`${created.label} is ready`}
					>
						<VStack gap={3}>
							<Text color="secondary" type="supporting">
								Its masked sending and OBS URLs are listed below. Copying one
								fetches the credential securely.
							</Text>
							<HStack>
								<Button
									label="Dismiss"
									size="sm"
									variant="ghost"
									onClick={() => setCreated(null)}
								/>
							</HStack>
						</VStack>
					</Banner>
				) : null}

				{pathsQuery.data?.length ? (
					<VStack gap={0}>
						{pathsQuery.data.map((path, index) => (
							<Fragment key={path.id}>
								{index > 0 ? <Divider /> : null}
								<PathRow path={path} />
							</Fragment>
						))}
					</VStack>
				) : (
					<EmptyState
						description="Create a device for your first video source."
						isCompact
						title="No publishing devices"
					/>
				)}

				<Divider />

				<HStack gap={2} vAlign="end" wrap="wrap">
					<TextInput
						label="Device name"
						placeholder="Main phone"
						value={label}
						onChange={(value) => setLabel(value)}
					/>
					<Button
						icon={<Icon color="inherit" icon={PlusIcon} size="sm" />}
						isDisabled={create.isPending || !label.trim()}
						label="Add device"
						variant="primary"
						onClick={() => create.mutate({ label })}
					/>
				</HStack>
				<HStack gap={2} wrap="wrap">
					<Button label="Redo setup" variant="ghost" onClick={onRedoSetup} />
					<Text color="secondary" type="supporting">
						Offers wipe or keep existing devices.
					</Text>
				</HStack>
			</VStack>
		</Card>
	);
}

function GuidanceCard() {
	const trpc = useTRPC();
	const [profile, setProfile] = useState<"wired" | "wifi" | "cellular">("wifi");
	const [rtt, setRtt] = useState<number | null>(null);
	const [measuring, setMeasuring] = useState(false);
	const [guidance, setGuidance] = useState<Guidance | null>(null);
	const submit = useMutation(
		trpc.rtt.submit.mutationOptions({
			onSuccess: setGuidance,
			onError: (error) => toast.error(error.message),
		}),
	);

	const measure = async () => {
		setMeasuring(true);
		try {
			const measured = await probeRelayRtt(env.VITE_RELAY_PING_URL);
			setRtt(measured);
			await submit.mutateAsync({
				rttMs: measured,
				profile,
				method: "browser-probe",
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Relay probe failed",
			);
		} finally {
			setMeasuring(false);
		}
	};

	return (
		<AdvancedSection
			id="dashboard-tuning"
			tag="Advanced · Tuning"
			title="Connection guidance"
			value="tuning"
		>
			<Text color="secondary" type="supporting">
				The browser estimate includes HTTPS overhead and deliberately rounds
				upward.
			</Text>
			<Selector
				label="Network profile"
				options={[
					{ value: "wired", label: "Wired" },
					{ value: "wifi", label: "Wi-Fi" },
					{ value: "cellular", label: "Cellular" },
				]}
				value={profile}
				onChange={(value) => setProfile(value as "wired" | "wifi" | "cellular")}
			/>
			<NumberInput
				description="Use the relay probe or enter a measured value."
				label="Estimated RTT (ms)"
				value={rtt}
				onChange={(value) => setRtt(value)}
			/>
			{guidance ? (
				<Card padding={3} variant="muted">
					<VStack gap={1}>
						<Text type="label">Recommended SRT latency: {guidance.ms} ms</Text>
						<Text type="supporting">
							OBS/FFmpeg query value: {guidance.micros} µs
						</Text>
						<Text type="supporting">Larix setting: {guidance.larixMs} ms</Text>
						<Text type="supporting">
							Suggested 1080p30 bitrate: {guidance.bitrateKbps["1080p30"]} kbps
						</Text>
						{guidance.note ? (
							<Text color="secondary" type="supporting">
								{guidance.note}
							</Text>
						) : null}
					</VStack>
				</Card>
			) : null}
			<HStack gap={2} wrap="wrap">
				<Button
					isLoading={measuring || submit.isPending}
					label="Measure relay RTT"
					variant="primary"
					onClick={measure}
				/>
				<Button
					isDisabled={
						submit.isPending ||
						rtt === null ||
						!Number.isInteger(rtt) ||
						rtt < 1
					}
					label="Use manual RTT"
					onClick={() => {
						if (rtt !== null) {
							submit.mutate({ rttMs: rtt, profile, method: "manual" });
						}
					}}
				/>
			</HStack>
		</AdvancedSection>
	);
}

function SetupCard() {
	return (
		<AdvancedSection
			id="dashboard-setup"
			tag="Advanced · Reference"
			title="OBS and scene switcher setup"
			value="reference"
		>
			<Text color="secondary" type="supporting">
				Import the generated scene collection, then configure Advanced Scene
				Switcher manually.
			</Text>
			<List listStyle="decimal">
				<ListItem label="Use the Media condition, not Source, to detect whether bytes are arriving." />
				<ListItem label="Ensure every condition and action toggle is enabled (blue, not grey)." />
				<ListItem label="Keep 2 second and 3 second debounces to avoid scene flapping during reconnects." />
				<ListItem label="Set a 2 second keyframe interval; enable adaptive bitrate in Larix on cellular." />
				<ListItem label="Only one publisher can own a path at once; RTMP is the fallback when UDP is blocked." />
			</List>
		</AdvancedSection>
	);
}
