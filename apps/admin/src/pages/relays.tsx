import { Badge } from "@VISP/ui/components/badge";
import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Input } from "@VISP/ui/components/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../components/page-header";
import {
	RelayCapacityForecast,
	useRelayForecasts,
} from "../components/relay-forecast";
import {
	RelayHistoryDetail,
	RelaySparklines,
} from "../components/relay-history";
import { trpc } from "../lib";
import {
	formatAge,
	formatDuration,
	formatGiB,
	loadTone,
	percent,
	usageTone,
} from "../lib/format";
import { hourlyUtilisation, relayHistoryWindow } from "../lib/relay-history";

type RelayRow = Awaited<
	ReturnType<typeof trpc.admin.relays.list.query>
>[number];

/**
 * Two independent signals, deliberately not merged into one "healthy" light:
 * the control API answering says MediaMTX is up, the pushed sample says the
 * box underneath it is not out of CPU, RAM, or disk. Either can fail alone.
 */
function RelayHealth({ relay }: { relay: RelayRow }) {
	const { probe, health } = relay;
	// A sample older than four timer intervals means the relay stopped talking.
	const stale = health
		? Date.now() - new Date(health.reportedAt).getTime() > 120_000
		: false;
	const memUsedPct = health
		? percent(health.memTotalKb - health.memAvailableKb, health.memTotalKb)
		: 0;
	const diskUsedPct = health
		? percent(health.diskTotalKb - health.diskAvailableKb, health.diskTotalKb)
		: 0;
	return (
		<div className="grid gap-1 text-xs">
			<div className="flex items-center gap-1.5">
				{probe.reachable ? (
					<Badge variant="secondary">API up</Badge>
				) : (
					<Badge variant="destructive">API down</Badge>
				)}
				{probe.reachable ? (
					<span className="text-muted-foreground">
						{probe.responseMs}ms · {probe.livePaths ?? "?"} live
					</span>
				) : null}
			</div>
			{health ? (
				<>
					<p className={loadTone(health.load1, health.cpuCount)}>
						CPU {health.load1.toFixed(2)} / {health.cpuCount} cores
						<span className="text-muted-foreground">
							{" "}
							({health.load5.toFixed(2)}, {health.load15.toFixed(2)})
						</span>
					</p>
					<p className={usageTone(memUsedPct)}>
						RAM {memUsedPct}% ·{" "}
						{formatGiB(health.memTotalKb - health.memAvailableKb)} of{" "}
						{formatGiB(health.memTotalKb)}
					</p>
					<p className={usageTone(diskUsedPct)}>
						Disk {diskUsedPct}% · {formatGiB(health.diskAvailableKb)} free
					</p>
					<p className={stale ? "text-destructive" : "text-muted-foreground"}>
						Up {formatDuration(health.uptimeSeconds)} · reported{" "}
						{formatAge(health.reportedAt)} ago
					</p>
				</>
			) : (
				<p className="text-muted-foreground">No host metrics reported</p>
			)}
		</div>
	);
}

function RelayAdmin() {
	const queryClient = useQueryClient();
	const relays = useQuery({
		queryKey: ["admin-relays"],
		queryFn: () => trpc.admin.relays.list.query(),
		refetchInterval: 15_000,
	});
	// One request for the whole fleet; the window ends on the next whole hour
	// so the key (and the hourly buckets) only change once an hour.
	const historyWindow = relayHistoryWindow();
	const history = useQuery({
		queryKey: ["admin-relay-history", historyWindow.from, historyWindow.to],
		queryFn: () =>
			trpc.admin.relayHistory.history.query({
				...historyWindow,
				bucket: "hour",
			}),
		refetchInterval: 5 * 60_000,
	});
	const historyByRelay = new Map(
		history.data?.relays.map((row) => [
			row.relayId,
			{
				row,
				points: hourlyUtilisation(row, history.data.from, history.data.to),
			},
		]),
	);
	const forecasts = useRelayForecasts(relays.data);
	const [expandedRelayId, setExpandedRelayId] = useState<number | null>(null);
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
			// A precondition conflict means this view is stale; show the real state.
			await queryClient.invalidateQueries({ queryKey: ["admin-relays"] });
		}
	};
	// Capacity edits commit on blur or Enter, but only after a confirm; a
	// cancelled edit puts the stored value back.
	const saveCapacity = (
		input: HTMLInputElement,
		relay: RelayRow,
		field: "capacityPaths" | "maxForwarders",
	) => {
		const value = Number(input.value);
		const current = relay[field];
		const valid =
			Number.isInteger(value) &&
			(field === "capacityPaths" ? value > 0 : value >= 0);
		if (!valid || value === current) {
			input.value = String(current);
			return;
		}
		const label =
			field === "capacityPaths" ? "path capacity" : "forwarder capacity";
		if (
			!window.confirm(
				`Change ${relay.name} ${label} from ${current} to ${value}?`,
			)
		) {
			input.value = String(current);
			return;
		}
		void run(
			() =>
				trpc.admin.relays.update.mutate(
					field === "capacityPaths"
						? {
								id: relay.id,
								capacityPaths: value,
								expected: { capacityPaths: current },
							}
						: {
								id: relay.id,
								maxForwarders: value,
								expected: { maxForwarders: current },
							},
				),
			field === "capacityPaths"
				? "Relay capacity updated"
				: "Forwarder capacity updated",
		);
	};
	const setEnabled = (relay: RelayRow, enabled: boolean) => {
		if (
			!window.confirm(
				enabled
					? `Enable ${relay.name}? New streams can be assigned to it.`
					: `Disable ${relay.name}? It stops receiving new assignments.`,
			)
		) {
			return;
		}
		void run(
			() =>
				trpc.admin.relays.update.mutate({
					id: relay.id,
					enabled,
					expected: { enabled: relay.enabled },
				}),
			enabled ? "Relay enabled" : "Relay disabled",
		);
	};
	const setDrained = (relay: RelayRow, drained: boolean) => {
		if (
			!window.confirm(
				drained
					? `Drain ${relay.name}? No new streams are placed on it.`
					: `Clear the drain on ${relay.name}? It can take new streams again.`,
			)
		) {
			return;
		}
		void run(
			() =>
				trpc.admin.relays.update.mutate({
					id: relay.id,
					drained,
					expected: { drained: relay.drainedAt !== null },
				}),
			drained ? "Relay draining" : "Drain cleared",
		);
	};

	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">Fleet</CardTitle>
				<CardDescription>
					Live control-API reachability and host metrics, plus capacity and
					draining without production SQL.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="overflow-x-auto">
					<table className="admin-table">
						<thead>
							<tr>
								<th>Relay</th>
								<th>Region</th>
								<th>Health</th>
								<th>Load</th>
								<th>Forwarders</th>
								<th>Last 7 days</th>
								<th>Capacity</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{relays.data?.map((relay) => {
								const relayHistory = historyByRelay.get(relay.id);
								const expanded = expandedRelayId === relay.id;
								return (
									<Fragment key={relay.id}>
										<tr className="cursor-default!">
											<td>
												<p className="font-medium">{relay.name}</p>
												<p className="text-muted-foreground text-xs">
													{relay.host}
												</p>
											</td>
											<td>{relay.region}</td>
											<td>
												<RelayHealth relay={relay} />
											</td>
											<td>
												<Input
													aria-label={`${relay.name} path capacity`}
													className="w-24"
													defaultValue={relay.capacityPaths}
													// Remount when the stored value changes elsewhere.
													key={`capacity-${relay.capacityPaths}`}
													type="number"
													onBlur={(event) =>
														saveCapacity(event.target, relay, "capacityPaths")
													}
													onKeyDown={(event) => {
														if (event.key === "Enter")
															event.currentTarget.blur();
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
													key={`forwarders-${relay.maxForwarders}`}
													type="number"
													onBlur={(event) =>
														saveCapacity(event.target, relay, "maxForwarders")
													}
													onKeyDown={(event) => {
														if (event.key === "Enter")
															event.currentTarget.blur();
													}}
												/>
												<p className="text-muted-foreground text-xs">
													{relay.activeForwarders} active ·{" "}
													{relay.reservedForwarders} reserved
												</p>
											</td>
											<td>
												<RelaySparklines
													expanded={expanded}
													loading={history.isPending}
													name={relay.name}
													points={relayHistory?.points}
													onToggle={() =>
														setExpandedRelayId(expanded ? null : relay.id)
													}
												/>
											</td>
											<td>
												<RelayCapacityForecast
													days={forecasts.days}
													forecast={forecasts.byRelay.get(relay.id)}
													loading={forecasts.loading}
												/>
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
														onClick={() => setEnabled(relay, !relay.enabled)}
													>
														{relay.enabled ? "Disable" : "Enable"}
													</Button>
													<Button
														size="sm"
														variant="outline"
														onClick={() => setDrained(relay, !relay.drainedAt)}
													>
														{relay.drainedAt ? "Undrain" : "Drain"}
													</Button>
												</div>
											</td>
										</tr>
										{expanded && relayHistory ? (
											<tr className="cursor-default! hover:bg-transparent!">
												<td colSpan={9}>
													<RelayHistoryDetail
														history={relayHistory.row}
														points={relayHistory.points}
													/>
												</td>
											</tr>
										) : null}
									</Fragment>
								);
							})}
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
							"Relay created disabled. Verify its configuration, then enable it.",
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

export function RelaysPage() {
	return (
		<div className="grid gap-6">
			<PageHeader
				description="Relay fleet health, capacity, and draining."
				title="Relays"
			/>
			<RelayAdmin />
		</div>
	);
}
