import { Badge } from "@VISP/ui/components/badge";
import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Checkbox } from "@VISP/ui/components/checkbox";
import { Input } from "@VISP/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@VISP/ui/components/native-select";
import { Toaster } from "@VISP/ui/components/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Ban,
	ChevronLeft,
	ChevronRight,
	CircleUserRound,
	Clock3,
	Database,
	LogOut,
	MonitorUp,
	Radio,
	RefreshCw,
	Search,
	ShieldCheck,
	Smartphone,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient, trpc } from "./lib";

type UsersResult = Awaited<ReturnType<typeof trpc.admin.users.list.query>>;
type UserRow = UsersResult["items"][number];
type UserDetail = Awaited<ReturnType<typeof trpc.admin.users.get.query>>;

function formatDate(value: string | null | undefined) {
	if (!value) return "Never";
	return new Intl.DateTimeFormat("en-FI", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function formatDuration(seconds: number) {
	const rounded = Math.max(0, Math.round(seconds));
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	if (hours) return `${hours}h ${minutes}m`;
	if (minutes) return `${minutes}m`;
	return `${rounded}s`;
}

function localDateTimeInput(value: string | null) {
	if (!value) return "";
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}

function Loading() {
	return (
		<div className="flex min-h-screen items-center justify-center text-muted-foreground">
			<RefreshCw className="mr-2 size-4 animate-spin" />
			Loading VISP Admin
		</div>
	);
}

function SignIn() {
	const [pending, setPending] = useState<"twitch" | "kick" | "google">();

	const signIn = async (provider: "twitch" | "kick" | "google") => {
		setPending(provider);
		const callbackURL = window.location.origin;
		const result =
			provider !== "kick"
				? await authClient.signIn.social({ provider, callbackURL })
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL,
					});
		if (result.error) {
			toast.error(result.error.message ?? "Sign in failed");
			setPending(undefined);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md border border-border/70 bg-card/95 shadow-2xl">
				<CardHeader>
					<div className="mb-4 flex size-10 items-center justify-center bg-primary text-primary-foreground">
						<ShieldCheck className="size-5" />
					</div>
					<CardTitle className="text-xl">VISP Admin</CardTitle>
					<CardDescription>
						Sign in with the same Twitch, Kick, or Google account you use with
						VISP.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						onClick={() => signIn("twitch")}
					>
						{pending === "twitch" ? "Opening Twitch…" : "Continue with Twitch"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("google")}
					>
						{pending === "google" ? "Opening Google…" : "Continue with Google"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("kick")}
					>
						{pending === "kick" ? "Opening Kick…" : "Continue with Kick"}
					</Button>
					<p className="pt-3 text-center text-muted-foreground text-xs">
						Administrator role required.
					</p>
				</CardContent>
			</Card>
		</main>
	);
}

function AccessDenied() {
	return (
		<main className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md border border-border/70">
				<CardHeader>
					<Ban className="mb-3 size-8 text-destructive" />
					<CardTitle className="text-xl">
						Administrator access required
					</CardTitle>
					<CardDescription>
						This VISP account is valid, but it does not have access to the
						support console.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						onClick={async () => {
							await authClient.signOut();
							window.location.reload();
						}}
					>
						<LogOut />
						Sign out
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}

function Metric({
	icon,
	label,
	value,
	detail,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	detail: string;
}) {
	return (
		<Card className="border border-border/60 bg-card/80">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardDescription className="font-medium uppercase tracking-wider">
						{label}
					</CardDescription>
					<span className="text-primary">{icon}</span>
				</div>
				<CardTitle className="font-mono text-3xl">{value}</CardTitle>
				<CardDescription>{detail}</CardDescription>
			</CardHeader>
		</Card>
	);
}

function UserTable({
	items,
	selectedId,
	onSelect,
}: {
	items: UserRow[];
	selectedId?: string;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="admin-table">
				<thead>
					<tr>
						<th>User</th>
						<th>Status</th>
						<th>Joined</th>
						<th>Devices</th>
						<th>Last stream</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr
							data-selected={item.id === selectedId}
							key={item.id}
							onClick={() => onSelect(item.id)}
						>
							<td>
								<div className="flex items-center gap-3">
									{item.image ? (
										<img
											alt=""
											className="size-8 object-cover"
											src={item.image}
										/>
									) : (
										<div className="flex size-8 items-center justify-center bg-muted">
											<CircleUserRound className="size-4" />
										</div>
									)}
									<div className="min-w-0">
										<p className="truncate font-medium">{item.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{item.email}
										</p>
									</div>
								</div>
							</td>
							<td>
								<div className="flex flex-wrap gap-1">
									<Badge
										variant={item.role === "admin" ? "default" : "outline"}
									>
										{item.role}
									</Badge>
									{item.banned && <Badge variant="destructive">banned</Badge>}
									{item.live && <Badge variant="secondary">live</Badge>}
								</div>
							</td>
							<td className="text-muted-foreground">
								{formatDate(item.createdAt)}
							</td>
							<td>
								<span className="font-mono">{item.activeDeviceCount}</span>
								{item.activeDeviceCount !== item.deviceCount && (
									<span className="text-muted-foreground">
										{" "}
										/ {item.deviceCount}
									</span>
								)}
							</td>
							<td className="text-muted-foreground">
								{formatDate(item.lastStreamedAt)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{items.length === 0 && (
				<div className="p-10 text-center text-muted-foreground">
					No users match these filters.
				</div>
			)}
		</div>
	);
}

function DetailItem({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[9rem_1fr] gap-3 border-border/60 border-b py-2 last:border-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words text-right">{value}</dd>
		</div>
	);
}

// Mirrors the hosted-feature flags admin.users.setFlag accepts.
const USER_FLAGS = [
	{
		key: "directDualOutput",
		label: "Portrait Direct output",
		hint: "Adds a separately framed portrait Direct destination and slot.",
	},
	{
		key: "betterTts",
		label: "Better TTS",
		hint: "Hosted speech, billed per character read out of chat.",
	},
	{
		key: "betterAudioIsolation",
		label: "Better audio isolation",
		hint: "Hosted mic isolation, billed per second of live audio.",
	},
	{
		key: "betterSubtitles",
		label: "Better subtitles",
		hint: "Hosted realtime captions, billed per minute of live audio.",
	},
] as const;

function UserDetailPanel({
	detail,
	currentUserId,
	onChanged,
}: {
	detail: UserDetail;
	currentUserId: string;
	onChanged: () => Promise<void>;
}) {
	const [role, setRole] = useState<"user" | "admin">(
		detail.identity.role === "admin" ? "admin" : "user",
	);
	const [reason, setReason] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [pending, setPending] = useState<string>();
	const [streamPages, setStreamPages] = useState<string[]>(["0"]);
	const streamCursor = streamPages.at(-1);
	const streams = useQuery({
		queryKey: ["admin-streams", detail.identity.id, streamCursor],
		queryFn: () =>
			trpc.admin.users.streams.query({
				userId: detail.identity.id,
				cursor: streamCursor,
				limit: 20,
			}),
	});

	useEffect(() => {
		setRole(detail.identity.role === "admin" ? "admin" : "user");
		setReason(detail.identity.banReason ?? "");
		setExpiresAt(localDateTimeInput(detail.identity.banExpires));
		setStreamPages(["0"]);
	}, [detail.identity]);

	const run = async (
		name: string,
		action: () => Promise<unknown>,
		message: string,
	) => {
		setPending(name);
		try {
			await action();
			toast.success(message);
			await onChanged();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Action failed");
		} finally {
			setPending(undefined);
		}
	};

	const identity = detail.identity;
	return (
		<div className="grid gap-4">
			<Card className="border border-border/60">
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<CardTitle className="text-lg">{identity.name}</CardTitle>
							<CardDescription>{identity.email}</CardDescription>
						</div>
						<div className="flex gap-1">
							<Badge
								variant={identity.role === "admin" ? "default" : "outline"}
							>
								{identity.role}
							</Badge>
							{identity.banned && <Badge variant="destructive">banned</Badge>}
							{detail.usage.live && <Badge variant="secondary">live</Badge>}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<dl>
						<DetailItem label="User ID" value={<code>{identity.id}</code>} />
						<DetailItem
							label="Providers"
							value={detail.providers.join(", ") || "None"}
						/>
						<DetailItem
							label="Email verified"
							value={identity.emailVerified ? "Yes" : "No"}
						/>
						<DetailItem label="Joined" value={formatDate(identity.createdAt)} />
						<DetailItem
							label="Active sessions"
							value={detail.auth.activeSessions}
						/>
						<DetailItem
							label="Last session refresh"
							value={formatDate(detail.auth.lastSessionRefreshAt)}
						/>
					</dl>
				</CardContent>
			</Card>

			<div className="grid gap-4 xl:grid-cols-2">
				<Card className="border border-border/60">
					<CardHeader>
						<CardTitle>VISP setup</CardTitle>
						<CardDescription>Read-only account configuration</CardDescription>
					</CardHeader>
					<CardContent>
						<dl>
							<DetailItem
								label="Handle"
								value={identity.handle ?? "Not created"}
							/>
							<DetailItem
								label="Onboarded"
								value={formatDate(identity.onboardedAt)}
							/>
							<DetailItem
								label="Publisher"
								value={identity.streamingSoftware ?? "Not selected"}
							/>
							<DetailItem
								label="Use case"
								value={identity.setupUseCase ?? "Not selected"}
							/>
							<DetailItem
								label="Destination"
								value={identity.streamDestination ?? "Not selected"}
							/>
							<DetailItem
								label="Advanced mode"
								value={identity.advancedMode ? "Enabled" : "Disabled"}
							/>
						</dl>
					</CardContent>
				</Card>

				<Card className="border border-border/60">
					<CardHeader>
						<CardTitle>Connections</CardTitle>
						<CardDescription>Operational integration state</CardDescription>
					</CardHeader>
					<CardContent>
						<dl>
							<DetailItem
								label="OBS last seen"
								value={formatDate(identity.obsLastSeenAt)}
							/>
							<DetailItem
								label="OBS streaming"
								value={identity.obsStreaming ? "Yes" : "No"}
							/>
							<DetailItem
								label="OBS scene"
								value={identity.obsCurrentScene ?? "Unknown"}
							/>
							<DetailItem label="OBS scenes" value={identity.obsSceneCount} />
							<DetailItem
								label="Chat"
								value={detail.chatProviders.join(", ") || "Not connected"}
							/>
						</dl>
					</CardContent>
				</Card>
			</div>

			<Card className="border border-border/60">
				<CardHeader>
					<CardTitle>Usage</CardTitle>
					<CardDescription>
						{detail.usage.trackedSessions} tracked sessions ·{" "}
						{formatDuration(detail.usage.trackedSeconds)} · last{" "}
						{formatDate(detail.usage.lastStreamedAt)}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					{detail.devices.map((device) => (
						<div
							className="grid gap-3 border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1fr_auto]"
							key={device.id}
						>
							<div>
								<div className="flex items-center gap-2">
									<Smartphone className="size-4 text-primary" />
									<p className="font-medium">{device.label}</p>
									{device.live && <Badge variant="secondary">live</Badge>}
									{device.revokedAt && <Badge variant="outline">revoked</Badge>}
								</div>
								<p className="mt-1 text-muted-foreground text-xs">
									#{device.seq} · {device.publishOrigin ?? "legacy"} · created{" "}
									{formatDate(device.createdAt)}
								</p>
							</div>
							<div className="text-left text-xs sm:text-right">
								<p className="font-mono">
									{device.trackedSessions} sessions ·{" "}
									{formatDuration(device.trackedSeconds)}
								</p>
								<p className="text-muted-foreground">
									Last{" "}
									{formatDate(
										device.lastTrackedAt ?? device.publishLastConnectedAt,
									)}
								</p>
							</div>
						</div>
					))}
					{detail.devices.length === 0 && (
						<p className="py-4 text-center text-muted-foreground">
							This user has not created any devices.
						</p>
					)}
				</CardContent>
			</Card>

			<Card className="border border-border/60">
				<CardHeader>
					<CardTitle>Relay sessions</CardTitle>
					<CardDescription>
						Exact tracking begins with the admin-console deployment.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="admin-table">
							<thead>
								<tr>
									<th>Started</th>
									<th>Device</th>
									<th>Source</th>
									<th>Duration</th>
								</tr>
							</thead>
							<tbody>
								{streams.data?.items.map((stream) => (
									<tr className="cursor-default!" key={stream.id}>
										<td>{formatDate(stream.startedAt)}</td>
										<td>{stream.deviceLabel}</td>
										<td>{stream.sourceType ?? "Unknown"}</td>
										<td>
											{stream.live ? (
												<Badge variant="secondary">live</Badge>
											) : (
												formatDuration(stream.durationSeconds)
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{streams.data && streams.data.items.length === 0 && (
						<p className="py-6 text-center text-muted-foreground">
							No tracked relay sessions.
						</p>
					)}
					<div className="mt-3 flex items-center justify-between">
						<Button
							disabled={streamPages.length === 1}
							size="sm"
							variant="outline"
							onClick={() => setStreamPages((pages) => pages.slice(0, -1))}
						>
							<ChevronLeft />
							Previous
						</Button>
						<span className="text-muted-foreground text-xs">
							{streams.data?.total ?? 0} sessions
						</span>
						<Button
							disabled={!streams.data?.nextCursor}
							size="sm"
							variant="outline"
							onClick={() => {
								if (streams.data?.nextCursor) {
									setStreamPages((pages) => [
										...pages,
										streams.data.nextCursor as string,
									]);
								}
							}}
						>
							Next
							<ChevronRight />
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card className="border border-border/60">
				<CardHeader>
					<CardTitle>Support actions</CardTitle>
					<CardDescription>
						Actions are recorded with administrator and target IDs.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-5">
					<div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
						<label
							className="grid gap-1 text-muted-foreground text-xs"
							htmlFor="user-role"
						>
							Role
							<NativeSelect
								className="w-full"
								disabled={identity.id === currentUserId}
								id="user-role"
								value={role}
								onChange={(event) =>
									setRole(event.target.value as "user" | "admin")
								}
							>
								<NativeSelectOption value="user">User</NativeSelectOption>
								<NativeSelectOption value="admin">Admin</NativeSelectOption>
							</NativeSelect>
						</label>
						<Button
							disabled={
								pending === "role" ||
								role === identity.role ||
								(identity.id === currentUserId && role !== "admin")
							}
							onClick={() =>
								run(
									"role",
									() =>
										trpc.admin.users.setRole.mutate({
											userId: identity.id,
											role,
										}),
									"Role updated",
								)
							}
						>
							Save role
						</Button>
					</div>

					<div className="grid gap-3 border-border/60 border-t pt-4">
						<div>
							<p className="font-medium">Feature access</p>
							<p className="text-muted-foreground text-xs">
								Each toggle saves on its own and is recorded separately.
							</p>
						</div>
						{USER_FLAGS.map(({ key, label, hint }) => (
							<label
								className="flex items-start gap-3"
								htmlFor={`flag-${key}`}
								key={key}
							>
								<Checkbox
									checked={identity[key] ?? false}
									disabled={pending === key}
									id={`flag-${key}`}
									onCheckedChange={(enabled) =>
										void run(
											key,
											() =>
												trpc.admin.users.setFlag.mutate({
													userId: identity.id,
													flag: key,
													enabled,
												}),
											`${label} ${enabled ? "enabled" : "disabled"}`,
										)
									}
								/>
								<span className="grid gap-0.5 leading-tight">
									<span className="font-medium text-sm">{label}</span>
									<span className="text-muted-foreground text-xs">{hint}</span>
								</span>
							</label>
						))}
					</div>

					{identity.banned ? (
						<div className="flex items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 p-3">
							<div>
								<p className="font-medium text-destructive">Account banned</p>
								<p className="text-muted-foreground text-xs">
									{identity.banReason || "No reason provided"} ·{" "}
									{identity.banExpires
										? `expires ${formatDate(identity.banExpires)}`
										: "no expiry"}
								</p>
							</div>
							<Button
								disabled={pending === "unban"}
								variant="outline"
								onClick={() =>
									run(
										"unban",
										() =>
											trpc.admin.users.unban.mutate({
												userId: identity.id,
											}),
										"User unbanned",
									)
								}
							>
								Unban
							</Button>
						</div>
					) : (
						<div className="grid gap-2">
							<label
								className="grid gap-1 text-muted-foreground text-xs"
								htmlFor="ban-reason"
							>
								Ban reason
								<Input
									id="ban-reason"
									maxLength={500}
									placeholder="Optional support note"
									value={reason}
									onChange={(event) => setReason(event.target.value)}
								/>
							</label>
							<div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
								<label
									className="grid gap-1 text-muted-foreground text-xs"
									htmlFor="ban-expires"
								>
									Ban expires
									<Input
										id="ban-expires"
										type="datetime-local"
										value={expiresAt}
										onChange={(event) => setExpiresAt(event.target.value)}
									/>
								</label>
								<Button
									disabled={pending === "ban" || identity.id === currentUserId}
									variant="destructive"
									onClick={() => {
										if (
											window.confirm(
												`Ban ${identity.name} and revoke their sessions?`,
											)
										) {
											void run(
												"ban",
												() =>
													trpc.admin.users.ban.mutate({
														userId: identity.id,
														reason: reason || undefined,
														expiresAt: expiresAt
															? new Date(expiresAt).toISOString()
															: undefined,
													}),
												"User banned",
											);
										}
									}}
								>
									<Ban />
									Ban account
								</Button>
							</div>
						</div>
					)}

					<div className="flex items-center justify-between gap-3 border-border/60 border-t pt-4">
						<div>
							<p className="font-medium">Revoke sessions</p>
							<p className="text-muted-foreground text-xs">
								Signs the user out of VISP products.
							</p>
						</div>
						<Button
							disabled={pending === "sessions"}
							variant="outline"
							onClick={() => {
								if (window.confirm(`Sign ${identity.name} out everywhere?`)) {
									void run(
										"sessions",
										() =>
											trpc.admin.users.revokeSessions.mutate({
												userId: identity.id,
											}),
										"Sessions revoked",
									);
								}
							}}
						>
							<LogOut />
							Revoke all
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function RelayAdmin() {
	const queryClient = useQueryClient();
	const relays = useQuery({
		queryKey: ["admin-relays"],
		queryFn: () => trpc.admin.relays.list.query(),
	});
	const [draft, setDraft] = useState({
		name: "",
		host: "",
		apiUrl: "",
		pingUrl: "",
		region: "",
		capacityPaths: "100",
		maxForwarders: "2",
		publicIp: "",
	});
	const run = async (action: () => Promise<unknown>, message: string) => {
		try {
			await action();
			await queryClient.invalidateQueries({ queryKey: ["admin-relays"] });
			toast.success(message);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Relay update failed",
			);
		}
	};

	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">Relays</CardTitle>
				<CardDescription>
					Register capacity and drain nodes without production SQL.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="overflow-x-auto">
					<table className="admin-table">
						<thead>
							<tr>
								<th>Relay</th>
								<th>Region</th>
								<th>Load</th>
								<th>Forwarders</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{relays.data?.map((relay) => (
								<tr className="cursor-default!" key={relay.id}>
									<td>
										<p className="font-medium">{relay.name}</p>
										<p className="text-muted-foreground text-xs">
											{relay.host}
										</p>
									</td>
									<td>{relay.region}</td>
									<td>
										<Input
											aria-label={`${relay.name} path capacity`}
											className="w-24"
											defaultValue={relay.capacityPaths}
											type="number"
											onBlur={(event) => {
												const capacityPaths = Number(event.target.value);
												if (
													Number.isInteger(capacityPaths) &&
													capacityPaths > 0 &&
													capacityPaths !== relay.capacityPaths
												) {
													void run(
														() =>
															trpc.admin.relays.update.mutate({
																id: relay.id,
																capacityPaths,
															}),
														"Relay capacity updated",
													);
												}
											}}
										/>
										<p className="text-muted-foreground text-xs">
											{relay.assignedPaths} assigned
										</p>
									</td>
									<td>
										<Input
											aria-label={`${relay.name} forwarder capacity`}
											className="w-20"
											defaultValue={relay.maxForwarders}
											type="number"
											onBlur={(event) => {
												const maxForwarders = Number(event.target.value);
												if (
													Number.isInteger(maxForwarders) &&
													maxForwarders >= 0 &&
													maxForwarders !== relay.maxForwarders
												) {
													void run(
														() =>
															trpc.admin.relays.update.mutate({
																id: relay.id,
																maxForwarders,
															}),
														"Forwarder capacity updated",
													);
												}
											}}
										/>
										<p className="text-muted-foreground text-xs">
											{relay.activeForwarders} active ·{" "}
											{relay.reservedForwarders} reserved
										</p>
									</td>
									<td>
										{relay.drainedAt ? (
											<Badge variant="outline">draining</Badge>
										) : relay.enabled ? (
											<Badge variant="secondary">enabled</Badge>
										) : (
											<Badge variant="destructive">disabled</Badge>
										)}
									</td>
									<td>
										<div className="flex gap-1">
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													void run(
														() =>
															trpc.admin.relays.update.mutate({
																id: relay.id,
																enabled: !relay.enabled,
															}),
														relay.enabled ? "Relay disabled" : "Relay enabled",
													)
												}
											>
												{relay.enabled ? "Disable" : "Enable"}
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													void run(
														() =>
															trpc.admin.relays.update.mutate({
																id: relay.id,
																drained: !relay.drainedAt,
															}),
														relay.drainedAt
															? "Drain cleared"
															: "Relay draining",
													)
												}
											>
												{relay.drainedAt ? "Undrain" : "Drain"}
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<form
					className="grid gap-2 md:grid-cols-4"
					onSubmit={(event) => {
						event.preventDefault();
						void run(
							() =>
								trpc.admin.relays.create.mutate({
									...draft,
									capacityPaths: Number(draft.capacityPaths),
									maxForwarders: Number(draft.maxForwarders),
								}),
							"Relay created",
						);
					}}
				>
					{(
						[
							["name", "Name"],
							["region", "Region"],
							["host", "Public host"],
							["publicIp", "Public IP"],
							["apiUrl", "Control API URL"],
							["pingUrl", "Ping URL"],
							["capacityPaths", "Path capacity"],
							["maxForwarders", "Max forwarders"],
						] as const
					).map(([field, placeholder]) => (
						<Input
							aria-label={placeholder}
							key={field}
							placeholder={placeholder}
							required
							type={
								field.endsWith("Url")
									? "url"
									: field === "capacityPaths" || field === "maxForwarders"
										? "number"
										: "text"
							}
							value={draft[field]}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									[field]: event.target.value,
								}))
							}
						/>
					))}
					<Button type="submit">Add relay</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function Console({
	session,
}: {
	session: NonNullable<ReturnType<typeof authClient.useSession>["data"]>;
}) {
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [search, setSearch] = useState("");
	const [role, setRole] = useState("");
	const [status, setStatus] = useState("");
	const [usage, setUsage] = useState("");
	const [selectedId, setSelectedId] = useState<string>();
	const [pages, setPages] = useState<string[]>(["0"]);
	const cursor = pages.at(-1);

	const overview = useQuery({
		queryKey: ["admin-overview"],
		queryFn: () => trpc.admin.overview.query(),
	});
	const users = useQuery({
		queryKey: ["admin-users", search, role, status, usage, cursor],
		queryFn: () =>
			trpc.admin.users.list.query({
				cursor,
				limit: 50,
				query: search || undefined,
				role: role ? (role as "user" | "admin") : undefined,
				status: status ? (status as "active" | "banned") : undefined,
				usage: usage
					? (usage as
							| "no-device"
							| "device"
							| "never-streamed"
							| "streamed"
							| "live")
					: undefined,
			}),
		enabled: overview.isSuccess,
	});
	const detail = useQuery({
		queryKey: ["admin-user", selectedId],
		queryFn: () => trpc.admin.users.get.query({ userId: selectedId as string }),
		enabled: Boolean(selectedId),
	});

	useEffect(() => {
		if (!selectedId && users.data?.items[0]) {
			setSelectedId(users.data.items[0].id);
		}
	}, [selectedId, users.data]);

	const resetPage = () => setPages(["0"]);
	const refresh = async () => {
		await queryClient.invalidateQueries();
	};

	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-20 border-border/70 border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 lg:px-6">
					<div className="flex items-center gap-3">
						<div className="flex size-8 items-center justify-center bg-primary text-primary-foreground">
							<ShieldCheck className="size-4" />
						</div>
						<div>
							<p className="font-semibold leading-none">VISP Admin</p>
							<p className="mt-1 text-muted-foreground text-xs">
								Support console
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="hidden text-right sm:block">
							<p className="text-xs">{session.user.name}</p>
							<p className="text-muted-foreground text-xs">
								{session.user.email}
							</p>
						</div>
						<Button
							size="icon"
							title="Refresh"
							variant="ghost"
							onClick={refresh}
						>
							<RefreshCw />
						</Button>
						<Button
							size="icon"
							title="Sign out"
							variant="ghost"
							onClick={async () => {
								await authClient.signOut();
								window.location.reload();
							}}
						>
							<LogOut />
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto grid max-w-[1800px] gap-6 p-4 lg:p-6">
				<section>
					<div className="mb-4">
						<h1 className="font-semibold text-2xl tracking-tight">Overview</h1>
						<p className="text-muted-foreground text-sm">
							Account adoption and live relay activity.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
						<Metric
							detail="All VISP accounts"
							icon={<Users className="size-4" />}
							label="Users"
							value={overview.data?.totalUsers ?? 0}
						/>
						<Metric
							detail="Joined in the last 7 days"
							icon={<Clock3 className="size-4" />}
							label="New users"
							value={overview.data?.recentUsers ?? 0}
						/>
						<Metric
							detail="Created at least one device"
							icon={<Smartphone className="size-4" />}
							label="With devices"
							value={overview.data?.usersWithDevices ?? 0}
						/>
						<Metric
							detail="Legacy or tracked evidence"
							icon={<Activity className="size-4" />}
							label="Ever streamed"
							value={overview.data?.everStreamed ?? 0}
						/>
						<Metric
							detail="Publishing in the last minute"
							icon={<Radio className="size-4" />}
							label="Live now"
							value={overview.data?.liveNow ?? 0}
						/>
					</div>
				</section>

				<section>
					<RelayAdmin />
				</section>

				<section className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(430px,0.65fr)]">
					<Card className="h-fit border border-border/60">
						<CardHeader>
							<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
								<div>
									<CardTitle className="text-lg">Users</CardTitle>
									<CardDescription>
										{users.data?.total ?? 0} accounts
									</CardDescription>
								</div>
								<form
									className="flex min-w-0 flex-1 gap-2 xl:max-w-sm"
									onSubmit={(event) => {
										event.preventDefault();
										setSearch(query.trim());
										resetPage();
									}}
								>
									<div className="relative flex-1">
										<Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
										<Input
											className="pl-8"
											placeholder="Name, email, or user ID"
											value={query}
											onChange={(event) => setQuery(event.target.value)}
										/>
									</div>
									<Button type="submit">Search</Button>
								</form>
							</div>
							<div className="mt-3 flex flex-wrap gap-2">
								<NativeSelect
									value={role}
									onChange={(event) => {
										setRole(event.target.value);
										resetPage();
									}}
								>
									<NativeSelectOption value="">All roles</NativeSelectOption>
									<NativeSelectOption value="user">User</NativeSelectOption>
									<NativeSelectOption value="admin">Admin</NativeSelectOption>
								</NativeSelect>
								<NativeSelect
									value={status}
									onChange={(event) => {
										setStatus(event.target.value);
										resetPage();
									}}
								>
									<NativeSelectOption value="">All statuses</NativeSelectOption>
									<NativeSelectOption value="active">Active</NativeSelectOption>
									<NativeSelectOption value="banned">Banned</NativeSelectOption>
								</NativeSelect>
								<NativeSelect
									value={usage}
									onChange={(event) => {
										setUsage(event.target.value);
										resetPage();
									}}
								>
									<NativeSelectOption value="">All usage</NativeSelectOption>
									<NativeSelectOption value="no-device">
										No device
									</NativeSelectOption>
									<NativeSelectOption value="device">
										Has device
									</NativeSelectOption>
									<NativeSelectOption value="never-streamed">
										Never streamed
									</NativeSelectOption>
									<NativeSelectOption value="streamed">
										Has streamed
									</NativeSelectOption>
									<NativeSelectOption value="live">Live now</NativeSelectOption>
								</NativeSelect>
							</div>
						</CardHeader>
						<CardContent className="px-0">
							{users.isPending ? (
								<div className="p-10 text-center text-muted-foreground">
									Loading users…
								</div>
							) : (
								<UserTable
									items={users.data?.items ?? []}
									selectedId={selectedId}
									onSelect={setSelectedId}
								/>
							)}
							<div className="flex items-center justify-between px-4 pt-4">
								<Button
									disabled={pages.length === 1}
									size="sm"
									variant="outline"
									onClick={() => setPages((current) => current.slice(0, -1))}
								>
									<ChevronLeft />
									Previous
								</Button>
								<span className="text-muted-foreground text-xs">
									Page {pages.length}
								</span>
								<Button
									disabled={!users.data?.nextCursor}
									size="sm"
									variant="outline"
									onClick={() => {
										if (users.data?.nextCursor) {
											setPages((current) => [
												...current,
												users.data.nextCursor as string,
											]);
										}
									}}
								>
									Next
									<ChevronRight />
								</Button>
							</div>
						</CardContent>
					</Card>

					<aside>
						{detail.isPending && selectedId ? (
							<Card className="border border-border/60 p-10 text-center text-muted-foreground">
								Loading user…
							</Card>
						) : detail.data ? (
							<UserDetailPanel
								currentUserId={session.user.id}
								detail={detail.data}
								onChanged={async () => {
									await Promise.all([
										queryClient.invalidateQueries({
											queryKey: ["admin-user", selectedId],
										}),
										queryClient.invalidateQueries({
											queryKey: ["admin-users"],
										}),
										queryClient.invalidateQueries({
											queryKey: ["admin-overview"],
										}),
									]);
								}}
							/>
						) : (
							<Card className="border border-border/60 p-10 text-center">
								<Database className="mx-auto mb-3 size-8 text-muted-foreground" />
								<p className="font-medium">Select a user</p>
								<p className="mt-1 text-muted-foreground text-xs">
									Account and relay details appear here.
								</p>
							</Card>
						)}
					</aside>
				</section>
			</main>
		</div>
	);
}

function App() {
	const session = authClient.useSession();
	const access = useQuery({
		queryKey: ["admin-access", session.data?.user.id],
		queryFn: () => trpc.admin.overview.query(),
		enabled: Boolean(session.data),
		retry: false,
	});

	if (session.isPending) return <Loading />;
	if (!session.data) {
		return (
			<>
				<SignIn />
				<Toaster />
			</>
		);
	}
	if (access.isPending) return <Loading />;
	if (access.isError) {
		const code =
			"data" in access.error
				? (access.error.data as { code?: string } | undefined)?.code
				: undefined;
		if (code === "FORBIDDEN") {
			return (
				<>
					<AccessDenied />
					<Toaster />
				</>
			);
		}
		return (
			<main className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-md border border-border/60">
					<CardHeader>
						<MonitorUp className="mb-3 size-8 text-destructive" />
						<CardTitle>Admin API unavailable</CardTitle>
						<CardDescription>{access.error.message}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => access.refetch()}>Try again</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<>
			<Console session={session.data} />
			<Toaster />
		</>
	);
}

export default App;
