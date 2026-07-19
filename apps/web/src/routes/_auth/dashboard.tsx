import type { AppRouter } from "@VISP/api/routers/index";
import { env } from "@VISP/env/web";
import { Badge } from "@VISP/ui/components/badge";
import { Button, buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@VISP/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@VISP/ui/components/field";
import { Input } from "@VISP/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@VISP/ui/components/native-select";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import {
	ChevronDownIcon,
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
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	downloadSceneCollection,
	RevealedValue,
} from "@/components/credential-reveal";
import { authClient } from "@/lib/auth-client";
import { probeRelayRtt } from "@/lib/relay";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
	beforeLoad: async ({ context }) => {
		const status = await context.queryClient.ensureQueryData(
			context.trpc.secrets.status.queryOptions(),
		);
		if (!status.onboardedAt) {
			throw redirect({ to: "/setup", search: { redo: false } });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
			<header className="flex flex-col gap-1">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					Signal path
				</p>
				<h1 className="font-bold font-display text-3xl uppercase tracking-tight">
					Relay dashboard
				</h1>
				<p className="text-muted-foreground text-sm">
					Devices publish to the relay, OBS reads the feeds, you go on air. Your
					provider stream key never enters VISP.
				</p>
			</header>
			<ChainStrip />
			<PublishingDevicesCard />
			<ObsControlCard />
			<section
				aria-labelledby="advanced-heading"
				className="flex flex-col gap-3"
			>
				<h2
					className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]"
					id="advanced-heading"
				>
					Advanced
				</h2>
				<CredentialsCard />
				<ConnectionsCard />
				<GuidanceCard />
				<SetupCard />
			</section>
		</main>
	);
}

function AdvancedSection({
	id,
	tag,
	title,
	action,
	children,
}: {
	id?: string;
	tag: string;
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<details className="group scroll-mt-6 border bg-card" id={id}>
			<summary className="flex cursor-pointer list-none flex-col gap-1 p-4 [&::-webkit-details-marker]:hidden">
				<StageTag>{tag}</StageTag>
				<span className="flex flex-wrap items-center gap-2 font-semibold">
					{title}
					{action}
					<ChevronDownIcon
						aria-hidden
						className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
					/>
				</span>
			</summary>
			<div className="flex flex-col gap-4 border-t p-4">{children}</div>
		</details>
	);
}

function StageTag({ children }: { children: string }) {
	return (
		<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
			{children}
		</p>
	);
}

type NodeState = "live" | "ok" | "warn" | "idle";

const nodeDot: Record<NodeState, string> = {
	live: "tally-pulse bg-tally",
	ok: "bg-signal",
	warn: "bg-caution",
	idle: "bg-muted-foreground",
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
	return (
		<a
			className="flex min-w-32 flex-1 flex-col gap-1 border bg-card p-3 transition-colors hover:border-ring"
			href={href}
		>
			<span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
				<span
					aria-hidden
					className={`size-1.5 rounded-full ${nodeDot[state]}`}
				/>
				{label}
			</span>
			<span className="font-display text-lg uppercase leading-tight tracking-wide">
				{value}
			</span>
		</a>
	);
}

function Connector() {
	return (
		<span
			aria-hidden
			className="h-px w-3 shrink-0 self-center bg-border sm:w-6"
		/>
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
		<nav
			aria-label="Signal chain"
			className="flex items-stretch overflow-x-auto"
		>
			<ChainNode
				href="#devices"
				label="Sources"
				state={live > 0 ? "live" : total > 0 ? "idle" : "warn"}
				value={total === 0 ? "No devices" : `${live} of ${total} live`}
			/>
			<Connector />
			<ChainNode
				href="#obs-read"
				label="Relay"
				state={readConfigured ? "ok" : "warn"}
				value={readConfigured ? "Keys set" : "Setup needed"}
			/>
			<Connector />
			<ChainNode
				href="#obs-control"
				label="OBS"
				state={obsStatus?.connected ? "ok" : "idle"}
				value={obsStatus?.connected ? "Connected" : "Not connected"}
			/>
			<Connector />
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
		</nav>
	);
}

type Outputs = inferRouterOutputs<AppRouter>;
type PathView = Outputs["paths"]["list"][number];
type SecretBundle = Outputs["secrets"]["rotate"];
type PublishUrls = Outputs["paths"]["reveal"]["urls"];
type CreatedDevice = Outputs["paths"]["create"];
type Guidance = Outputs["rtt"]["submit"];
type ObsPairing = Outputs["obs"]["pair"];
type SnapshotView = Outputs["obs"]["snapshots"][number];

function SnapshotTile({ snapshot }: { snapshot: SnapshotView }) {
	return (
		<li className="flex flex-col gap-2 border p-2">
			<div className="relative aspect-video overflow-hidden bg-muted">
				<p className="absolute inset-0 grid place-items-center p-3 text-center text-muted-foreground text-sm">
					Snapshot pending
				</p>
				{snapshot.url ? (
					<img
						alt={`Latest snapshot from ${snapshot.label}`}
						className="absolute inset-0 size-full object-cover"
						key={snapshot.url}
						loading="lazy"
						onError={(event) => {
							event.currentTarget.hidden = true;
						}}
						src={snapshot.url}
					/>
				) : null}
			</div>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<strong>{snapshot.label}</strong>
				<span className="text-muted-foreground text-xs">
					{snapshot.capturedAt
						? `Captured ${formatUtc(snapshot.capturedAt)}`
						: "Waiting for first capture"}
				</span>
			</div>
		</li>
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
		<Card className="scroll-mt-6" id="obs-control">
			<CardHeader>
				<StageTag>Stage 02 · On air</StageTag>
				<CardTitle>OBS</CardTitle>
				<CardDescription>
					Start or stop your OBS stream and watch what each live feed is
					sending.
				</CardDescription>
				<CardAction>
					<Badge variant={status?.connected ? "default" : "outline"}>
						<span
							aria-hidden
							className={`size-1.5 rounded-full ${status?.connected ? "bg-tally" : "bg-muted-foreground"}`}
						/>
						{status?.connected ? "Connected" : "Disconnected"}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<p className="text-muted-foreground">
					{status?.configured
						? status.pending
							? "OBS has not acknowledged the latest command yet."
							: status.streaming
								? "OBS reports that the stream is live."
								: "OBS reports that the stream is stopped."
						: "OBS is not paired yet. Open plugin pairing below to connect it."}
				</p>
				<section
					aria-labelledby="obs-snapshots-heading"
					className="flex flex-col gap-3"
				>
					<div className="flex flex-col gap-1">
						<h2 className="font-medium" id="obs-snapshots-heading">
							Live stream snapshots
						</h2>
						<p className="text-muted-foreground text-sm">
							Each live feed refreshes about once per minute.
						</p>
					</div>
					{snapshotsQuery.isPending ? (
						<Skeleton className="aspect-video w-full" />
					) : snapshotsQuery.data?.length ? (
						<ul className="grid gap-3 sm:grid-cols-2">
							{snapshotsQuery.data.map((snapshot) => (
								<SnapshotTile key={snapshot.pathId} snapshot={snapshot} />
							))}
						</ul>
					) : (
						<Empty className="border py-6">
							<EmptyHeader>
								<EmptyTitle>No live streams</EmptyTitle>
								<EmptyDescription>
									Snapshots appear here when a publishing device is live.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</section>
				<details className="group border">
					<summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium text-sm [&::-webkit-details-marker]:hidden">
						Plugin pairing
						<ChevronDownIcon
							aria-hidden
							className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
						/>
					</summary>
					<div className="flex flex-col gap-3 border-t p-3">
						<p className="text-muted-foreground text-sm">
							Generate a token, then open Tools → VISP Remote Control in OBS.
							Paste the token there or import the downloaded config.ini. VISP
							stores only a one-way hash, and generating another token
							disconnects the old one.
						</p>
						{pairing ? (
							<RevealedValue label="OBS pairing token" value={pairing.token} />
						) : null}
						<div className="flex flex-wrap gap-2">
							<Button
								disabled={pair.isPending}
								variant="outline"
								onClick={() => {
									if (
										!status?.configured ||
										window.confirm("Replace the current OBS pairing token?")
									) {
										pair.mutate();
									}
								}}
							>
								<MonitorIcon data-icon="inline-start" />
								{status?.configured
									? "Rotate pairing token"
									: "Generate pairing token"}
							</Button>
							{pairing ? (
								<Button variant="secondary" onClick={downloadConfig}>
									<DownloadIcon data-icon="inline-start" />
									Download plugin config
								</Button>
							) : null}
						</div>
					</div>
				</details>
			</CardContent>
			<CardFooter>
				<Button
					disabled={
						!status?.connected || status.pending || setStreaming.isPending
					}
					onClick={() => setStreaming.mutate({ streaming: !status?.streaming })}
				>
					<PowerIcon data-icon="inline-start" />
					{status?.streaming ? "Stop OBS stream" : "Start OBS stream"}
				</Button>
			</CardFooter>
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
						callbackURL: "/dashboard",
						// Twitch tokens keep only the last-requested scopes, so always
						// re-request the union or one feature's consent drops the other's.
						scopes: chatConsent
							? ["user:read:chat", "channel:manage:broadcast"]
							: undefined,
					})
				: await authClient.oauth2.link({
						providerId: provider,
						callbackURL: "/dashboard",
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
		<AdvancedSection tag="Advanced · Chat" title="Connections">
			<p className="text-muted-foreground text-sm">
				Link either provider for login, then opt into its read-only live chat
				separately.
			</p>
			{connections.data?.map((connection) => {
				const label = connection.provider === "twitch" ? "Twitch" : "Kick";
				return (
					<div
						className="flex flex-wrap items-center justify-between gap-3 border p-3"
						key={connection.provider}
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<span className="font-medium">{label}</span>
								<Badge variant={connection.linked ? "secondary" : "outline"}>
									{connection.linked ? "Linked" : "Not linked"}
								</Badge>
								{connection.enabled ? <Badge>Chat on</Badge> : null}
							</div>
							<span className="text-muted-foreground text-sm">
								{connection.enabled
									? "Messages can appear in VISP Native."
									: "Chat is disabled."}
							</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{!connection.linked ? (
								<Button
									variant="outline"
									onClick={() => void link(connection.provider)}
								>
									<LinkIcon data-icon="inline-start" />
									Link
								</Button>
							) : connection.needsConsent ? (
								<Button onClick={() => void link("twitch", true)}>
									<MessageCircleIcon data-icon="inline-start" />
									Authorize chat
								</Button>
							) : connection.enabled ? (
								<Button
									disabled={disable.isPending}
									variant="outline"
									onClick={() =>
										disable.mutate({ provider: connection.provider })
									}
								>
									Disable chat
								</Button>
							) : (
								<Button
									disabled={enable.isPending}
									onClick={() =>
										enable.mutate({ provider: connection.provider })
									}
								>
									<MessageCircleIcon data-icon="inline-start" />
									Enable chat
								</Button>
							)}
							{connection.linked ? (
								<Button
									disabled={linkedCount < 2 || disable.isPending}
									variant="ghost"
									onClick={() =>
										void unlink(connection.provider, connection.enabled)
									}
								>
									<UnlinkIcon data-icon="inline-start" />
									Unlink
								</Button>
							) : null}
						</div>
					</div>
				);
			})}
			<p className="text-muted-foreground text-sm">
				Disabling chat keeps the provider available for sign-in. At least one
				login must remain linked.
			</p>
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
					<Badge
						className="border-signal/40 bg-signal/10 text-signal"
						variant="outline"
					>
						<span aria-hidden className="size-1.5 rounded-full bg-signal" />
						Configured
					</Badge>
				) : (
					<Badge variant="outline">Setup required</Badge>
				)
			}
			id="obs-read"
			tag="Advanced · Relay to OBS"
			title="OBS read credentials"
		>
			<p className="text-muted-foreground text-sm">
				These URLs let OBS receive your feeds. Publish URLs are managed per
				device above.
			</p>
			{bundle ? (
				<div className="flex flex-col gap-4">
					<RevealedValue label="Read secret" value={bundle.revealed.read} />
					{bundle.urls.read.map((url) => (
						<div className="flex flex-col gap-2" key={url.slug}>
							<span className="font-medium">Read: {url.slug}</span>
							<RevealedValue label="Read SRT URL" value={url.srt} />
							<RevealedValue label="Read RTMP fallback" value={url.rtmp} />
						</div>
					))}
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					{configured
						? revealable
							? "Reveal your read URLs anytime — one per device, including newly added ones. Rotating replaces the secret and breaks existing OBS sources."
							: "Read credentials from before revealing was supported can only be replaced. Rotate once to make them revealable."
						: "Generate read credentials to receive your device feeds in OBS."}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{configured && revealable ? (
					<Button disabled={reveal.isPending} onClick={() => reveal.mutate()}>
						<EyeIcon data-icon="inline-start" />
						Reveal read URLs
					</Button>
				) : null}
				{configured ? (
					<Button
						disabled={rotate.isPending}
						variant="outline"
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
					>
						<RotateCwIcon data-icon="inline-start" />
						Rotate read
					</Button>
				) : (
					<Button
						disabled={rotate.isPending}
						onClick={() => rotate.mutate({ kind: "read" })}
					>
						Generate OBS credentials
					</Button>
				)}
				{bundle?.sceneCollection ? (
					<Button variant="secondary" onClick={downloadScene}>
						<DownloadIcon data-icon="inline-start" />
						Download OBS collection
					</Button>
				) : null}
				<Link
					className={buttonVariants({ variant: "ghost" })}
					search={{ redo: true }}
					to="/setup"
				>
					Redo setup
				</Link>
			</div>
		</AdvancedSection>
	);
}

function PathStatus({ path }: { path: PathView }) {
	if (path.stale) {
		return (
			<Badge
				className="border-caution/40 bg-caution/10 text-caution"
				variant="outline"
			>
				<span aria-hidden className="size-1.5 rounded-full bg-caution" />
				Status unknown
			</Badge>
		);
	}
	if (path.publishing) {
		return (
			<Badge
				className="border-tally/40 bg-tally/15 text-tally"
				variant="outline"
			>
				<span
					aria-hidden
					className="tally-pulse size-1.5 rounded-full bg-tally"
				/>
				Live
			</Badge>
		);
	}
	return <Badge variant="secondary">Offline</Badge>;
}

function formatUtc(value: string) {
	return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

function PathRow({ path }: { path: PathView }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [label, setLabel] = useState(path.label);
	const [revealed, setRevealed] = useState<PublishUrls | null>(null);
	const rename = useMutation(
		trpc.paths.rename.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Device renamed");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reveal = useMutation(
		trpc.paths.reveal.mutationOptions({
			onSuccess: (result) => setRevealed(result.urls),
			onError: (error) => toast.error(error.message),
		}),
	);
	const rotate = useMutation(
		trpc.paths.rotatePublish.mutationOptions({
			onSuccess: async (result) => {
				setRevealed(result.urls);
				await queryClient.invalidateQueries();
				toast.success("Publish URL rotated for this device");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
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
		<div className="flex flex-col gap-2 border p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<strong>{path.label}</strong>
				<PathStatus path={path} />
			</div>
			<p className="text-muted-foreground text-sm">
				{path.publishLastConnectedAt
					? `Last connected ${formatUtc(path.publishLastConnectedAt)}`
					: "Never connected"}
			</p>
			<details className="group">
				<summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground text-sm hover:text-foreground [&::-webkit-details-marker]:hidden">
					<ChevronDownIcon
						aria-hidden
						className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
					/>
					Manage device
				</summary>
				<div className="flex flex-col gap-3 pt-3">
					<p className="flex flex-wrap items-center gap-2">
						<code className="text-muted-foreground text-xs">{path.slug}</code>
						<Badge variant="outline">
							{path.publishOrigin === "native"
								? "VISP Native"
								: path.publishOrigin === "web"
									? "Web"
									: "Legacy"}
						</Badge>
					</p>
					<form
						className="flex flex-wrap items-end gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							rename.mutate({ pathId: path.id, label });
						}}
					>
						<Field className="min-w-48 flex-1">
							<FieldLabel className="sr-only" htmlFor={`path-${path.id}`}>
								Device name
							</FieldLabel>
							<Input
								id={`path-${path.id}`}
								maxLength={64}
								value={label}
								onChange={(event) => setLabel(event.target.value)}
							/>
						</Field>
						<Button
							disabled={
								rename.isPending || !label.trim() || label === path.label
							}
							size="sm"
							type="submit"
						>
							Save
						</Button>
					</form>
					<div className="flex flex-wrap gap-2">
						{path.publishRevealable ? (
							<Button
								disabled={reveal.isPending}
								size="sm"
								variant="outline"
								onClick={() => reveal.mutate({ pathId: path.id })}
							>
								<EyeIcon data-icon="inline-start" />
								Reveal URL
							</Button>
						) : null}
						<Button
							disabled={rotate.isPending}
							size="sm"
							variant="outline"
							onClick={() => {
								const warning = path.publishRevealable
									? `Rotate ${path.label}? Its current publish URL will stop working.`
									: `Create a device URL for ${path.label}? Its legacy account-wide URL will stop working on this path.`;
								if (window.confirm(warning)) {
									rotate.mutate({ pathId: path.id });
								}
							}}
						>
							<RotateCwIcon data-icon="inline-start" />
							{path.publishRevealable
								? "Rotate this device"
								: "Create device URL"}
						</Button>
						<Button
							disabled={revoke.isPending}
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
						>
							<Trash2Icon data-icon="inline-start" />
							Revoke
						</Button>
					</div>
					{revealed ? (
						<div className="flex flex-col gap-2">
							<RevealedValue label="Publish SRT URL" value={revealed.srt} />
							<RevealedValue
								label="Publish RTMP fallback"
								value={revealed.rtmp}
							/>
						</div>
					) : null}
				</div>
			</details>
		</div>
	);
}

function PublishingDevicesCard() {
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
				setCreated(result);
				setLabel("");
				await queryClient.invalidateQueries();
				toast.success("Publishing device created");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card className="scroll-mt-6" id="devices">
			<CardHeader>
				<StageTag>Stage 01 · Sources</StageTag>
				<CardTitle>Publishing devices</CardTitle>
				<CardDescription>
					Every device has its own publish URL. Revealing or rotating one never
					affects the others.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{created ? (
					<div className="flex flex-col gap-4 border border-signal/40 bg-signal/5 p-3">
						<div className="flex flex-col gap-2">
							<p className="font-medium">
								{created.path.label} — publish from your device
							</p>
							<RevealedValue label="Publish SRT URL" value={created.urls.srt} />
							<RevealedValue
								label="Publish RTMP fallback"
								value={created.urls.rtmp}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<p className="font-medium">
								{created.path.label} — receive in OBS
							</p>
							{created.read ? (
								<>
									<p className="text-muted-foreground text-sm">
										Add this as a Media Source in OBS to see the feed.
									</p>
									<RevealedValue
										label="Read SRT URL"
										value={created.read.srt}
									/>
									<RevealedValue
										label="Read RTMP fallback"
										value={created.read.rtmp}
									/>
								</>
							) : (
								<p className="text-muted-foreground text-sm">
									To receive this feed in OBS, rotate your{" "}
									<a className="underline" href="#obs-read">
										OBS read credentials
									</a>{" "}
									once — after that, read URLs appear here automatically.
								</p>
							)}
						</div>
						<Button
							className="self-start"
							size="sm"
							variant="ghost"
							onClick={() => setCreated(null)}
						>
							Done, hide URLs
						</Button>
					</div>
				) : null}
				{pathsQuery.data?.length ? (
					pathsQuery.data.map((path) => <PathRow key={path.id} path={path} />)
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>No publishing devices</EmptyTitle>
							<EmptyDescription>
								Create a device for your first video source.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>
			<CardFooter>
				<form
					className="flex w-full flex-wrap items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({ label });
					}}
				>
					<Field className="min-w-48 flex-1">
						<FieldLabel htmlFor="new-path-label">Device name</FieldLabel>
						<Input
							id="new-path-label"
							maxLength={64}
							placeholder="Main phone"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
						/>
					</Field>
					<Button disabled={create.isPending || !label.trim()} type="submit">
						<PlusIcon data-icon="inline-start" />
						Add device
					</Button>
				</form>
			</CardFooter>
		</Card>
	);
}

function GuidanceCard() {
	const trpc = useTRPC();
	const [profile, setProfile] = useState<"wired" | "wifi" | "cellular">("wifi");
	const [rtt, setRtt] = useState("");
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
			setRtt(String(measured));
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
		<AdvancedSection tag="Advanced · Tuning" title="Connection guidance">
			<p className="text-muted-foreground text-sm">
				The browser estimate includes HTTPS overhead and deliberately rounds
				upward.
			</p>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="network-profile">Network profile</FieldLabel>
					<NativeSelect
						className="w-full"
						id="network-profile"
						value={profile}
						onChange={(event) =>
							setProfile(event.target.value as "wired" | "wifi" | "cellular")
						}
					>
						<NativeSelectOption value="wired">Wired</NativeSelectOption>
						<NativeSelectOption value="wifi">Wi-Fi</NativeSelectOption>
						<NativeSelectOption value="cellular">Cellular</NativeSelectOption>
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="rtt-ms">Estimated RTT (ms)</FieldLabel>
					<Input
						id="rtt-ms"
						inputMode="numeric"
						min={1}
						max={10000}
						type="number"
						value={rtt}
						onChange={(event) => setRtt(event.target.value)}
					/>
					<FieldDescription>
						Use the relay probe or enter a measured value.
					</FieldDescription>
				</Field>
			</FieldGroup>
			{guidance ? (
				<div className="flex flex-col gap-2 border p-3">
					<strong>Recommended SRT latency: {guidance.ms} ms</strong>
					<span>OBS/FFmpeg query value: {guidance.micros} µs</span>
					<span>Larix setting: {guidance.larixMs} ms</span>
					<span>
						Suggested 1080p30 bitrate: {guidance.bitrateKbps["1080p30"]} kbps
					</span>
					{guidance.note ? (
						<p className="text-muted-foreground">{guidance.note}</p>
					) : null}
				</div>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Button disabled={measuring || submit.isPending} onClick={measure}>
					{measuring ? "Measuring..." : "Measure relay RTT"}
				</Button>
				<Button
					disabled={
						submit.isPending ||
						!Number.isInteger(Number(rtt)) ||
						Number(rtt) < 1
					}
					variant="outline"
					onClick={() =>
						submit.mutate({ rttMs: Number(rtt), profile, method: "manual" })
					}
				>
					Use manual RTT
				</Button>
			</div>
		</AdvancedSection>
	);
}

function SetupCard() {
	return (
		<AdvancedSection
			tag="Advanced · Reference"
			title="OBS and scene switcher setup"
		>
			<p className="text-muted-foreground text-sm">
				Import the generated scene collection, then configure Advanced Scene
				Switcher manually.
			</p>
			<ol className="list-decimal pl-5">
				<li>
					Use the Media condition, not Source, to detect whether bytes are
					arriving.
				</li>
				<li>
					Ensure every condition and action toggle is enabled (blue, not grey).
				</li>
				<li>
					Keep 2 second and 3 second debounces to avoid scene flapping during
					reconnects.
				</li>
				<li>
					Set a 2 second keyframe interval; enable adaptive bitrate in Larix on
					cellular.
				</li>
				<li>
					Only one publisher can own a path at once; RTMP is the fallback when
					UDP is blocked.
				</li>
			</ol>
		</AdvancedSection>
	);
}
