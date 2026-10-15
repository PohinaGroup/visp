import { METRICS_DATA_START } from "@VISP/api/routers/admin/metrics-window";
import { Badge } from "@VISP/ui/components/badge";
import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { TrendLineChart } from "@VISP/ui/components/charts";
import { KpiTile } from "@VISP/ui/components/kpi-tile";
import { cn } from "@VISP/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	type DateRange,
	pickDateRangeSearch,
	toApiRange,
	useDateRange,
	useUtcNow,
} from "../app/date-range";
import {
	OverviewAttention,
	OverviewSpendTile,
} from "../components/overview-slots";
import { PageHeader } from "../components/page-header";
import { trpc } from "../lib";
import {
	formatDuration,
	formatGiB,
	loadTone,
	percent,
	usageTone,
} from "../lib/format";
import {
	activeStreamersLabel,
	bucketColumnLabel,
	comparisonLabel,
	dataStartNote,
	formatBucket,
	formatKpiValue,
	liveSeriesWindow,
	OVERVIEW_TREND_ID,
	type OverviewTile,
	overviewTiles,
	startsBeforeData,
	type TileTarget,
	trendExportFilename,
	trendRows,
} from "../lib/overview";

type OverviewData = Awaited<ReturnType<typeof trpc.admin.overview.query>>;
type AppHost = OverviewData["appHost"];

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

/** Inline failure for one query, with a retry that refetches only it. */
function QueryError({
	what,
	error,
	onRetry,
	className,
}: {
	what: string;
	error: unknown;
	onRetry: () => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-start gap-2 border border-destructive/40 border-dashed p-4 text-sm",
				className,
			)}
			role="alert"
		>
			<p>
				<span className="font-medium">Could not load {what}.</span>{" "}
				<span className="text-muted-foreground">{errorMessage(error)}</span>
			</p>
			<Button size="sm" variant="outline" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

/**
 * The existing `admin.overview` query reduced to one number: everything else
 * it returns is superseded by the range-aware KPI tiles, but "live right
 * now" is the one thing a range cannot answer.
 */
function LiveNowBadge({
	liveNow,
	loading,
	failed,
}: {
	liveNow: number | undefined;
	loading: boolean;
	failed: boolean;
}) {
	if (failed) {
		return <Badge variant="destructive">Live count unavailable</Badge>;
	}
	if (loading || liveNow === undefined) {
		return <Badge variant="outline">Live now …</Badge>;
	}
	return (
		<Badge title="Publishing in the last minute" variant="outline">
			<span
				aria-hidden="true"
				className={cn(
					"size-2 rounded-full",
					liveNow > 0 ? "animate-pulse bg-success" : "bg-muted-foreground/50",
				)}
			/>
			<span className="font-mono tabular-nums">{liveNow}</span> live now
		</Badge>
	);
}

/** Layout spans: one row at `xl`, headline pair over the other three below. */
const TILE_SPAN = {
	headline: "sm:col-span-3 xl:col-span-2",
	secondary: "sm:col-span-2 xl:col-span-1",
} as const;
const TILE_GRID = "grid gap-3 sm:grid-cols-6 xl:grid-cols-7";
/** Headline tiles share one emphasis so neither KPI reads as secondary. */
const HEADLINE_TILE = "p-5 ring-2 ring-primary/25";

const SECONDARY_LABELS = [
	"Signups",
	"Signup → first stream (7 days)",
	"Sessions per streamer",
];

function useOpenTarget() {
	const navigate = useNavigate();
	return (target: TileTarget) => {
		if (target.kind === "route") {
			void navigate({
				to: target.to,
				search: (prev: Record<string, unknown>) => pickDateRangeSearch(prev),
			});
			return;
		}
		const section = document.getElementById(target.id);
		section?.scrollIntoView({ behavior: "smooth", block: "start" });
		section?.focus({ preventScroll: true });
	};
}

function KpiTiles({ range }: { range: DateRange }) {
	const apiRange = toApiRange(range);
	const now = useUtcNow();
	const open = useOpenTarget();
	const kpis = useQuery({
		queryKey: ["admin-metrics-kpis", apiRange],
		queryFn: () =>
			trpc.admin.metrics.kpis.query({
				from: apiRange.from,
				to: apiRange.to,
				compareFrom: apiRange.compareFrom,
				compareTo: apiRange.compareTo,
			}),
	});

	if (kpis.isError) {
		return (
			<QueryError
				error={kpis.error}
				what="headline metrics"
				onRetry={() => void kpis.refetch()}
			/>
		);
	}

	if (!kpis.data) {
		return (
			<div className={TILE_GRID}>
				{[activeStreamersLabel(range.days), "Streaming hours"].map((label) => (
					<KpiTile
						className={cn(TILE_SPAN.headline, HEADLINE_TILE)}
						key={label}
						label={label}
						loading
						value={null}
					/>
				))}
				{SECONDARY_LABELS.map((label) => (
					<KpiTile
						className={TILE_SPAN.secondary}
						key={label}
						label={label}
						loading
						value={null}
					/>
				))}
			</div>
		);
	}

	const tiles = overviewTiles(
		kpis.data.kpis,
		range,
		apiRange,
		now,
		new Date(kpis.data.dataStart),
	);
	if (tiles.length === 0) {
		return (
			<p className="border border-border border-dashed p-4 text-muted-foreground text-sm">
				No metrics for this period.
			</p>
		);
	}
	const maturing = tiles.some((tile) => tile.formattedValue === "Maturing");
	return (
		<>
			<div className={TILE_GRID}>
				{tiles.map((tile: OverviewTile) => (
					<KpiTile
						className={cn(
							tile.headline ? TILE_SPAN.headline : TILE_SPAN.secondary,
							tile.headline && HEADLINE_TILE,
						)}
						comparisonLabel={comparisonLabel(range)}
						deltaPct={tile.deltaPct}
						formatValue={tile.formatValue}
						formattedValue={tile.formattedValue}
						key={tile.key}
						label={tile.label}
						previous={tile.previous}
						sparkline={tile.sparkline}
						value={tile.value}
						onClick={() => open(tile.target)}
					/>
				))}
			</div>
			{maturing && (
				<p className="mt-2 text-muted-foreground text-xs">
					Signup → first stream leaves out the last 7 days of the range, whose
					signups have not had a full week yet; this range has nothing older.
				</p>
			)}
		</>
	);
}

type TrendMetric = "weekly_active_streamers" | "streaming_hours";

/**
 * One live metric over the range. Active streamers and streaming hours get a
 * chart each rather than sharing an axis: hours run several times higher
 * than the streamer count, so one axis would flatten the streamer line, and
 * the shared chart primitive has a single y axis by design.
 */
function TrendCard({
	metric,
	title,
	description,
	range,
}: {
	metric: TrendMetric;
	title: string;
	description: string;
	range: DateRange;
}) {
	const liveWindow = liveSeriesWindow(toApiRange(range), METRICS_DATA_START);
	const series = useQuery({
		queryKey: ["admin-metrics-series", metric, range.interval, liveWindow],
		enabled: liveWindow !== null,
		queryFn: () => {
			if (!liveWindow) throw new Error("No live data in this range");
			return trpc.admin.metrics.series.query({
				metric,
				interval: range.interval,
				from: liveWindow.from,
				to: liveWindow.to,
			});
		},
	});
	const unit = metric === "streaming_hours" ? "hours" : "count";
	const headingId = `${OVERVIEW_TREND_ID}-${metric}`;

	return (
		<Card
			aria-labelledby={headingId}
			className="border border-border/60"
			role="region"
		>
			<CardHeader>
				<CardTitle>
					<h3 className="font-medium text-base" id={headingId}>
						{title}
					</h3>
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{series.isError ? (
					<QueryError
						className="h-[220px] justify-center"
						error={series.error}
						what={title.toLowerCase()}
						onRetry={() => void series.refetch()}
					/>
				) : (
					<TrendLineChart
						ariaLabel={title}
						categoryLabel={bucketColumnLabel(range.interval)}
						data={
							liveWindow ? series.data && trendRows(series.data.buckets) : []
						}
						description={description}
						emptyMessage={
							liveWindow
								? "Nobody streamed in this period"
								: `No live data yet: ${dataStartNote(METRICS_DATA_START).toLowerCase()}`
						}
						exportFilename={trendExportFilename(metric, range)}
						height={220}
						loading={liveWindow !== null && series.isPending}
						series={[{ key: "value", label: title }]}
						valueFormatter={(value) => formatKpiValue(unit, value)}
						xKey="bucket"
						xTickFormatter={formatBucket}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function Trends({ range }: { range: DateRange }) {
	const daily = range.interval === "day";
	return (
		<section
			aria-labelledby={`${OVERVIEW_TREND_ID}-heading`}
			className="scroll-mt-20 outline-none"
			id={OVERVIEW_TREND_ID}
			tabIndex={-1}
		>
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<h2
					className="font-semibold text-lg"
					id={`${OVERVIEW_TREND_ID}-heading`}
				>
					Trend
				</h2>
				{startsBeforeData(range, METRICS_DATA_START) && (
					<p className="text-muted-foreground text-xs">
						{dataStartNote(METRICS_DATA_START)}
					</p>
				)}
			</div>
			<div className="grid gap-3 lg:grid-cols-2">
				<TrendCard
					description={
						daily
							? "Distinct streamers with a stream in the 7 days ending each day."
							: "Distinct streamers with a stream in each ISO week."
					}
					metric="weekly_active_streamers"
					range={range}
					title="Weekly active streamers"
				/>
				<TrendCard
					description={
						daily
							? "Hours streamed per day, by when each session started."
							: "Hours streamed per ISO week, by when each session started."
					}
					metric="streaming_hours"
					range={range}
					title="Streaming hours"
				/>
			</div>
		</section>
	);
}

/** The app host reports itself: no agent needed, the process is already here. */
function AppHostCard({
	host,
	error,
	onRetry,
}: {
	host: AppHost | undefined;
	error: unknown;
	onRetry: () => void;
}) {
	const memUsedPct = host
		? percent(host.memTotalBytes - host.memFreeBytes, host.memTotalBytes)
		: 0;
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle>
					<h2 className="text-lg">App server</h2>
				</CardTitle>
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
				) : error ? (
					<QueryError
						className="sm:col-span-4"
						error={error}
						what="host metrics"
						onRetry={onRetry}
					/>
				) : (
					<p className="text-muted-foreground">Loading host metrics…</p>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * The admin home: the two headline KPIs (active streamers and streaming
 * hours, equal weight) and three supporting tiles for the selected range,
 * their trend, then operational panels. Layout follows the audit wireframe;
 * slots in `overview-slots.tsx` hold the places of panels other tasks add.
 */
export function OverviewPage() {
	const range = useDateRange();
	const apiRange = toApiRange(range);
	const overview = useQuery({
		queryKey: ["admin-overview"],
		queryFn: () => trpc.admin.overview.query(),
		refetchInterval: 15_000,
	});

	return (
		<div className="grid gap-8">
			<section aria-labelledby="overview-kpis-heading">
				<div className="mb-4">
					<PageHeader
						actions={
							<LiveNowBadge
								failed={overview.isError && !overview.data}
								liveNow={overview.data?.liveNow}
								loading={overview.isPending}
							/>
						}
						description="Who is streaming, how much, and whether new signups get there."
						title="Overview"
					/>
				</div>
				<h2 className="sr-only" id="overview-kpis-heading">
					Headline metrics
				</h2>
				<KpiTiles range={range} />
			</section>

			<Trends range={range} />

			<div className="grid gap-3 empty:hidden lg:auto-cols-fr lg:grid-flow-col">
				<OverviewAttention range={apiRange} />
				<OverviewSpendTile range={apiRange} />
			</div>

			<section>
				<AppHostCard
					error={overview.error}
					host={overview.data?.appHost}
					onRetry={() => void overview.refetch()}
				/>
			</section>
		</div>
	);
}
