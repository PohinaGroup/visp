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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Ban,
	ChevronLeft,
	ChevronRight,
	LogOut,
	Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib";
import { formatDate, formatDuration, localDateTimeInput } from "../lib/format";
import { AuditActionBadge, AuditDiff, auditActorName } from "./audit-log";
import { DetailItem } from "./detail-item";

export type UserDetail = Awaited<ReturnType<typeof trpc.admin.users.get.query>>;

// Mirrors the hosted-feature flags admin.users.setFlag accepts.
const USER_FLAGS = [
	{
		key: "directDualOutput",
		label: "Portrait Direct output",
		hint: "Adds a separately framed portrait Direct destination and slot.",
	},
	{
		key: "chatBotAccountSelection",
		label: "Chat bot account selection",
		hint: "Allows Twitch chat messages to use the streamer's own account.",
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
	{
		key: "brbHighlights",
		label: "BRB highlights",
		hint: "Internal beta for uploaded highlight playlists during Direct BRB.",
	},
] as const;

export function UserDetailPanel({
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
	const queryClient = useQueryClient();
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

	const recentActions = useQuery({
		queryKey: ["admin-audit", "user", detail.identity.id],
		queryFn: () =>
			trpc.admin.audit.list.query({
				targetType: "user",
				targetId: detail.identity.id,
				limit: 10,
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
			await Promise.all([
				onChanged(),
				queryClient.invalidateQueries({ queryKey: ["admin-audit"] }),
			]);
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
						Every action is recorded in the audit log.
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

			<Card className="border border-border/60">
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<CardTitle>Recent actions</CardTitle>
							<CardDescription>
								The last admin actions taken on this account.
							</CardDescription>
						</div>
						<Link
							className="shrink-0 text-primary text-xs underline-offset-4 hover:underline"
							search={{ targetType: "user", target: identity.id }}
							to="/audit"
						>
							View all
						</Link>
					</div>
				</CardHeader>
				<CardContent>
					{recentActions.isPending ? (
						<p className="py-4 text-center text-muted-foreground">Loading…</p>
					) : recentActions.data?.items.length ? (
						<ul className="grid">
							{recentActions.data.items.map((row) => (
								<li
									className="grid gap-1 border-border/60 border-b py-2 last:border-0"
									key={row.id}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<AuditActionBadge action={row.action} />
										<span className="text-muted-foreground text-xs">
											{auditActorName(row)} · {formatDate(row.createdAt)}
										</span>
									</div>
									<AuditDiff after={row.after} before={row.before} />
								</li>
							))}
						</ul>
					) : (
						<p className="py-4 text-center text-muted-foreground">
							{recentActions.isError
								? recentActions.error.message
								: "No admin actions recorded for this user."}
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
