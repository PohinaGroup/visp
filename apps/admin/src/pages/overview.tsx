import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, Clock3, Radio, Smartphone, Users } from "lucide-react";
import { Metric } from "../components/metric";
import { PageHeader } from "../components/page-header";
import { trpc } from "../lib";
import {
	formatDuration,
	formatGiB,
	loadTone,
	percent,
	usageTone,
} from "../lib/format";

type AppHost = NonNullable<
	Awaited<ReturnType<typeof trpc.admin.overview.query>>["appHost"]
>;

/** The app host reports itself: no agent needed, the process is already here. */
function AppHostCard({ host }: { host: AppHost | undefined }) {
	const memUsedPct = host
		? percent(host.memTotalBytes - host.memFreeBytes, host.memTotalBytes)
		: 0;
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">App server</CardTitle>
				<CardDescription>
					The host answering this request. Relay hosts are on the{" "}
					<Link
						className="text-primary underline-offset-4 hover:underline"
						to="/relays"
					>
						Relays
					</Link>{" "}
					page.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2 text-sm sm:grid-cols-4">
				{host ? (
					<>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								CPU load
							</p>
							<p className={`font-mono ${loadTone(host.load1, host.cpuCount)}`}>
								{host.load1.toFixed(2)} / {host.cpuCount}
							</p>
							<p className="text-muted-foreground text-xs">
								{host.load5.toFixed(2)}, {host.load15.toFixed(2)} avg
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								RAM
							</p>
							<p className={`font-mono ${usageTone(memUsedPct)}`}>
								{memUsedPct}%
							</p>
							<p className="text-muted-foreground text-xs">
								{formatGiB((host.memTotalBytes - host.memFreeBytes) / 1024)} of{" "}
								{formatGiB(host.memTotalBytes / 1024)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Server process
							</p>
							<p className="font-mono">
								{formatGiB(host.processRssBytes / 1024)}
							</p>
							<p className="text-muted-foreground text-xs">
								up {formatDuration(host.processUptimeSeconds)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wider">
								Host uptime
							</p>
							<p className="font-mono">{formatDuration(host.uptimeSeconds)}</p>
						</div>
					</>
				) : (
					<p className="text-muted-foreground">Loading host metrics…</p>
				)}
			</CardContent>
		</Card>
	);
}

export function OverviewPage() {
	const overview = useQuery({
		queryKey: ["admin-overview"],
		queryFn: () => trpc.admin.overview.query(),
		refetchInterval: 15_000,
	});

	return (
		<div className="grid gap-6">
			<section>
				<div className="mb-4">
					<PageHeader
						description="Account adoption and live relay activity."
						title="Overview"
					/>
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
				<AppHostCard host={overview.data?.appHost} />
			</section>
		</div>
	);
}
