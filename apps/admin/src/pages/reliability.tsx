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
/** "4.5s", "45s", "1m 26s": start-to-live is seconds, rarely minutes. */
function formatSeconds(value: number) {
	if (value < 10) return `${Math.round(value * 10) / 10}s`;
	const rounded = Math.round(value);
	if (rounded < 60) return `${rounded}s`;
	return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}
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
				description="Direct session success, start-to-live latency, relay RTT and relay load."
				title="Reliability"
			/>

			{startsBeforeData && dataStart ? (
				<p className="flex items-center gap-2 text-muted-foreground text-xs">
					<Info aria-hidden="true" className="size-3.5" />
					Data starts {DATA_START_LABEL.format(new Date(dataStart))}. Sessions
					before it never recorded going live, so success and start-to-live
					begin there.
				</p>
			) : null}

			<section
				aria-label="Reliability KPIs"
				className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
			>
				<KpiTile
					formatValue={formatRate}
					label="Session success rate"
					loading={kpiLoading}
					previous={prior?.successRate}
					value={totals?.successRate}
				/>
				<KpiTile
					formatValue={formatSeconds}
					invert
					label="Start-to-live p50"
					loading={kpiLoading}
					previous={prior?.startToLiveP50Sec}
					value={totals?.startToLiveP50Sec}
				/>
				<KpiTile
					formatValue={formatSeconds}
					invert
					label="Start-to-live p95"
					loading={kpiLoading}
					previous={prior?.startToLiveP95Sec}
					value={totals?.startToLiveP95Sec}
				/>
				<KpiTile
					label="Direct sessions started"
					loading={kpiLoading}
					previous={prior?.started}
					value={totals?.started}
				/>
			</section>

			{success.isError ? <ErrorText error={success.error} /> : null}

			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					description={`Direct sessions that reached live, of those started; target ${TARGET_PCT}%.`}
					title="Session success rate"
				>
					<TrendLineChart
						ariaLabel="Direct session success rate per bucket"
						categoryLabel={unit}
						data={rows}
						emptyMessage="No Direct sessions in this period"
						loading={success.isPending}
						referenceLine={{ y: TARGET_PCT, label: `Target ${TARGET_PCT}%` }}
						series={[{ key: "successPct", label: "Success rate" }]}
						valueFormatter={formatPct}
						xKey="bucket"
						xTickFormatter={formatBucket}
					/>
				</ChartCard>

				<ChartCard
					description="Seconds from the phone connecting to the first platform output going live."
					title="Start-to-live"
				>
					<TrendLineChart
						ariaLabel="Start-to-live p50 and p95 per bucket, seconds"
						categoryLabel={unit}
						data={rows}
						emptyMessage="No Direct session went live in this period"
						loading={success.isPending}
						series={[
							{ key: "p50Sec", label: "p50" },
							{ key: "p95Sec", label: "p95" },
						]}
						valueFormatter={formatSeconds}
						xKey="bucket"
						xTickFormatter={formatBucket}
					/>
				</ChartCard>
			</div>

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
