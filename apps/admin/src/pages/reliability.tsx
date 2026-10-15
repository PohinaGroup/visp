import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { HorizontalBarChart, TrendLineChart } from "@VISP/ui/components/charts";
import { KpiTile } from "@VISP/ui/components/kpi-tile";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { toApiRange, useDateRange } from "../app/date-range";
import { PageHeader } from "../components/page-header";
import { trpc } from "../lib";
import {
	canCompare,
	relayPeaks,
	relayPeakWindow,
	rttByRelay,
	SUCCESS_RATE_TARGET,
	successRows,
} from "../lib/reliability";

const TARGET_PCT = SUCCESS_RATE_TARGET * 100;

const BUCKET_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const DATA_START_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

function formatBucket(value: string | number) {
	return BUCKET_LABEL.format(new Date(value));
}

function formatRate(rate: number) {
	return new Intl.NumberFormat("en-US", {
		style: "percent",
		maximumFractionDigits: 1,
	}).format(rate);
}

const formatPct = (value: number) => `${Math.round(value * 10) / 10}%`;
const formatMs = (value: number) => `${Math.round(value)} ms`;

function ChartCard({
	title,
	description,
	children,
}: {
	title: string;
	description: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function ErrorText({ error }: { error: unknown }) {
	return (
		<p className="text-destructive text-sm">
			{error instanceof Error ? error.message : "Could not load this chart."}
		</p>
	);
}

export function ReliabilityPage() {
	const range = useDateRange();
	const api = toApiRange(range);
	const bounds = { from: api.from, to: api.to, interval: api.interval };

	const success = useQuery({
		queryKey: ["admin-reliability-success", bounds],
		queryFn: () => trpc.admin.reliability.sessionSuccess.query(bounds),
	});
	const dataStart = success.data?.dataStart;
	// No delta when the comparison window reaches before tracking began.
	const compareBounds = canCompare(api.compareFrom, dataStart)
		? {
				from: api.compareFrom,
				to: api.compareTo ?? api.from,
				interval: api.interval,
			}
		: null;
	const previous = useQuery({
		queryKey: ["admin-reliability-success", compareBounds],
		queryFn: () =>
			compareBounds
				? trpc.admin.reliability.sessionSuccess.query(compareBounds)
				: null,
		enabled: compareBounds !== null,
	});
	const rtt = useQuery({
		queryKey: ["admin-reliability-rtt", bounds],
		queryFn: () => trpc.admin.reliability.rtt.query(bounds),
	});
	const peakWindow = relayPeakWindow(api.from, api.to);
	const relayHistory = useQuery({
		queryKey: ["admin-relay-history", peakWindow.from, peakWindow.to, "day"],
		queryFn: () =>
			trpc.admin.relayHistory.history.query({
				from: peakWindow.from,
				to: peakWindow.to,
				bucket: "day",
			}),
	});

	const totals = success.data?.totals;
	const prior = compareBounds ? previous.data?.totals : undefined;
	const rows = successRows(success.data);
	const rttRelays = rttByRelay(rtt.data);
	const peaks = relayPeaks(relayHistory.data);
	const startsBeforeData =
		dataStart !== undefined &&
		new Date(api.from).getTime() < new Date(dataStart).getTime();
	const unit = api.interval === "day" ? "Day" : "Week";
	const kpiLoading =
		success.isPending || (compareBounds !== null && previous.isPending);

	return (
		<div className="grid gap-6">
			<PageHeader
				description="Session stability, relay RTT and relay load."
				title="Reliability"
			/>

			{startsBeforeData && dataStart ? (
				<p className="flex items-center gap-2 text-muted-foreground text-xs">
					<Info aria-hidden="true" className="size-3.5" />
					Data starts {DATA_START_LABEL.format(new Date(dataStart))}. Sessions
					were not recorded before it, so stability begins there.
				</p>
			) : null}

			<section
				aria-label="Reliability KPIs"
				className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
			>
				<KpiTile
					formatValue={formatRate}
					label="Stable sessions"
					loading={kpiLoading}
					previous={prior?.stableRate}
					value={totals?.stableRate}
				/>
				<KpiTile
					label="Sessions started"
					loading={kpiLoading}
					previous={prior?.started}
					value={totals?.started}
				/>
			</section>

			{success.isError ? <ErrorText error={success.error} /> : null}

			<ChartCard
				description={`Sessions that lasted at least a minute, of those started; the rest are reconnect blips. Target ${TARGET_PCT}%.`}
				title="Stable sessions"
			>
				<TrendLineChart
					ariaLabel="Stable session rate per bucket"
					categoryLabel={unit}
					data={rows}
					emptyMessage="No sessions in this period"
					loading={success.isPending}
					referenceLine={{ y: TARGET_PCT, label: `Target ${TARGET_PCT}%` }}
					series={[{ key: "stablePct", label: "Stable" }]}
					valueFormatter={formatPct}
					xKey="bucket"
					xTickFormatter={formatBucket}
				/>
			</ChartCard>

			<ChartCard
				description="Setup probes from streamers to each relay: p50 and p95 across each streamer's median, so heavy probers count once."
				title="Relay RTT"
			>
				{rtt.isError ? (
					<ErrorText error={rtt.error} />
				) : rtt.isPending || rttRelays.length === 0 ? (
					<TrendLineChart
						ariaLabel="Relay RTT"
						data={[]}
						emptyMessage="No RTT probes in this period"
						loading={rtt.isPending}
						series={[{ key: "p50Ms", label: "p50" }]}
						xKey="bucket"
					/>
				) : (
					<div className="grid gap-6 lg:grid-cols-2">
						{rttRelays.map((relay) => (
							<div className="grid gap-1" key={relay.relayId}>
								<p className="font-medium text-sm">{relay.relayName}</p>
								<p className="text-muted-foreground text-xs">
									{relay.samples.toLocaleString("en-US")} samples
								</p>
								<TrendLineChart
									ariaLabel={`${relay.relayName} RTT p50 and p95, milliseconds`}
									categoryLabel={unit}
									data={relay.rows}
									height={180}
									series={[
										{ key: "p50Ms", label: "p50" },
										{ key: "p95Ms", label: "p95" },
									]}
									valueFormatter={formatMs}
									xKey="bucket"
									xTickFormatter={formatBucket}
								/>
							</div>
						))}
					</div>
				)}
			</ChartCard>

			<ChartCard
				description={
					peakWindow.clamped
						? "Highest CPU (1-minute load ÷ cores), RAM and disk use per relay over the last 400 days of the range."
						: "Highest CPU (1-minute load ÷ cores), RAM and disk use per relay over the range."
				}
				title="Relay peak load"
			>
				{relayHistory.isError ? (
					<ErrorText error={relayHistory.error} />
				) : (
					<HorizontalBarChart
						ariaLabel="Peak CPU, RAM and disk use per relay"
						categoryKey="relay"
						categoryLabel="Relay"
						data={peaks}
						emptyMessage="No relay health samples in this period"
						loading={relayHistory.isPending}
						series={[
							{ key: "cpuPct", label: "CPU" },
							{ key: "memPct", label: "RAM" },
							{ key: "diskPct", label: "Disk" },
						]}
						showValues
						valueFormatter={(value) => `${Math.round(value)}%`}
					/>
				)}
			</ChartCard>
		</div>
	);
}
