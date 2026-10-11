import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { BarSeriesChart, TrendLineChart } from "@VISP/ui/components/charts";
import {
	NativeSelect,
	NativeSelectOption,
} from "@VISP/ui/components/native-select";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { downloadCsv, toCsv } from "@VISP/ui/lib/csv";
import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { type ReactNode, useId } from "react";
import { toApiRange, useDateRange } from "../app/date-range";
import { useSearchParam } from "../app/search";
import { CohortHeatmap } from "../components/cohort-heatmap";
import { PageHeader } from "../components/page-header";
import { trpc } from "../lib";
import {
	clampRange,
	type FunnelSegmentResult,
	foldSegments,
	formatHours,
	funnelCsvRows,
	funnelRows,
	funnelSegmentLabel,
	GROWTH_SEGMENTS,
	type GrowthSegment,
	isFunnelEmpty,
	parseSegment,
	retentionWeeks,
	SEGMENT_LABELS,
	SEGMENT_SEARCH_KEY,
	STAGE_LABELS,
	segmentToSearch,
	signupStack,
	stageConversion,
	startsBeforeData,
	timeToFirstLiveRows,
} from "../lib/growth";

const BUCKET_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const COUNT = new Intl.NumberFormat("en-US");
const PERCENT = new Intl.NumberFormat("en-US", {
	style: "percent",
	maximumFractionDigits: 1,
});

function formatBucket(value: string | number) {
	return BUCKET_LABEL.format(new Date(value));
}

function ChartCard({
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="grid gap-1">
						<CardTitle className="text-lg">{title}</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
					{actions}
				</div>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function ErrorText({ error }: { error: unknown }) {
	return (
		<p className="text-destructive text-sm" role="alert">
			{error instanceof Error ? error.message : "Could not load this chart."}
		</p>
	);
}

function SegmentControl({
	value,
	onChange,
}: {
	value: GrowthSegment;
	onChange: (segment: GrowthSegment) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2 text-muted-foreground text-xs">
			<label htmlFor={id}>Segment</label>
			<NativeSelect
				id={id}
				onChange={(event) => onChange(parseSegment(event.target.value))}
				size="sm"
				value={value}
			>
				{GROWTH_SEGMENTS.map((segment) => (
					<NativeSelectOption key={segment} value={segment}>
						{SEGMENT_LABELS[segment]}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</div>
	);
}

/**
 * One activation funnel as a table: a bar per stage proportional to the
 * signups at the top, the stage count, and the conversion from the stage
 * before among users whose window has closed. A custom component rather than
 * `HorizontalBarChart` because each row carries three numbers (count,
 * conversion, still-maturing) that a bar chart would hide in a tooltip.
 */
function Funnel({
	segment,
	title,
	compact,
}: {
	segment: FunnelSegmentResult;
	title: string;
	compact?: boolean;
}) {
	const rows = funnelRows(segment);
	const any = segment.firstLiveAny;
	const anyRate = stageConversion(any).rate;
	return (
		<table className="w-full text-xs tabular-nums">
			<caption
				className={compact ? "pb-2 text-left font-medium text-sm" : "sr-only"}
			>
				{title}
			</caption>
			<thead className="sr-only">
				<tr>
					<th scope="col">Stage</th>
					<th scope="col">Users</th>
					<th scope="col">Conversion from previous stage</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row, index) => (
					<tr className="align-middle" key={row.stage}>
						<th
							className={`whitespace-nowrap py-1 pr-3 text-left font-normal ${compact ? "w-32" : "w-40"}`}
							scope="row"
						>
							{row.label}
						</th>
						<td className="py-1 pr-3">
							<div className="flex items-center gap-2">
								<div aria-hidden="true" className="h-4 flex-1 bg-muted/40">
									<div
										className="h-full"
										style={{
											width: `${row.share * 100}%`,
											minWidth: row.count > 0 ? 2 : 0,
											background: "var(--chart-1)",
										}}
									/>
								</div>
								<span className="w-14 text-right font-medium">
									{COUNT.format(row.count)}
								</span>
							</div>
						</td>
						<td
							className={`py-1 text-right text-muted-foreground ${compact ? "w-28" : "w-44"}`}
						>
							{index === 0 ? (
								<span className="sr-only">Start of funnel</span>
							) : (
								<>
									<span className="text-foreground">
										{row.conversion === null
											? "—"
											: PERCENT.format(row.conversion)}
									</span>
									{row.unobserved > 0 ? (
										<span className="block">
											{COUNT.format(row.unobserved)} not yet observed
										</span>
									) : null}
								</>
							)}
						</td>
					</tr>
				))}
			</tbody>
			<tfoot>
				<tr>
					<td className="pt-2 text-left text-muted-foreground" colSpan={3}>
						{STAGE_LABELS.first_live_any}: {COUNT.format(any.count)}
						{anyRate === null ? "" : ` (${PERCENT.format(anyRate)})`}
					</td>
				</tr>
			</tfoot>
		</table>
	);
}

export function GrowthPage() {
	const range = useDateRange();
	const api = toApiRange(range);
	const bounds = clampRange(api);
	const [rawSegment, setRawSegment] = useSearchParam(SEGMENT_SEARCH_KEY);
	const segment = parseSegment(rawSegment);
	const setSegment = (next: GrowthSegment) =>
		setRawSegment(segmentToSearch(next));

	const signups = useQuery({
		queryKey: ["admin-growth-signups", bounds.from, bounds.to, api.interval],
		queryFn: () =>
			trpc.admin.metrics.series.query({
				metric: "signups",
				interval: api.interval,
				from: bounds.from,
				to: bounds.to,
				segment: "provider",
			}),
	});
	const funnel = useQuery({
		queryKey: ["admin-growth-funnel", bounds.from, bounds.to, segment],
		queryFn: () =>
			trpc.admin.growth.funnel.query({
				from: bounds.from,
				to: bounds.to,
				segment,
			}),
	});
	const ttfl = useQuery({
		queryKey: ["admin-growth-ttfl", bounds.from, bounds.to],
		queryFn: () =>
			trpc.admin.growth.timeToFirstLive.query({
				from: bounds.from,
				to: bounds.to,
			}),
	});
	const weeks = retentionWeeks(range.days);
	const retention = useQuery({
		queryKey: ["admin-growth-retention", weeks, api.to],
		queryFn: () => trpc.admin.growth.retention.query({ weeks, to: api.to }),
	});

	const dataStart =
		funnel.data?.dataStart ??
		ttfl.data?.dataStart ??
		retention.data?.dataStart ??
		signups.data?.dataStart ??
		undefined;
	const beforeData = startsBeforeData(bounds.from, dataStart);
	const dataStartLabel = dataStart
		? LONG_DATE.format(new Date(dataStart))
		: null;

	const stack = signupStack(signups.data?.buckets ?? []);
	const funnelSegments =
		segment === "none"
			? (funnel.data?.segments ?? [])
			: foldSegments(funnel.data?.segments ?? []);
	const ttflRows = timeToFirstLiveRows(ttfl.data);
	const notSegmented =
		segment === "none"
			? ""
			: ` Not split by ${SEGMENT_LABELS[segment].toLowerCase()}.`;
	const unit = api.interval === "day" ? "Day" : "Week";
	const liveFromLater =
		funnel.data?.liveFrom != null &&
		Date.parse(funnel.data.liveFrom) > Date.parse(bounds.from);

	return (
		<div className="grid gap-6">
			<PageHeader
				actions={<SegmentControl onChange={setSegment} value={segment} />}
				description="Signups, activation funnel, time to first live and retention cohorts."
				title="Growth"
			/>

			{beforeData && dataStartLabel ? (
				<p className="flex items-center gap-2 text-muted-foreground text-xs">
					<Info aria-hidden="true" className="size-3.5" />
					Data starts {dataStartLabel}. Going live was not recorded before it,
					so live stages, time to first live and retention only count signups
					from then on.
				</p>
			) : null}
			{bounds.clamped ? (
				<p className="flex items-center gap-2 text-muted-foreground text-xs">
					<Info aria-hidden="true" className="size-3.5" />
					Growth charts show the latest 400 days of the selected range.
				</p>
			) : null}

			<ChartCard
				description="Eligible signups per bucket, stacked by the provider they signed up with."
				title="Signups"
			>
				{signups.isError ? (
					<ErrorText error={signups.error} />
				) : (
					<BarSeriesChart
						ariaLabel={`Signups per ${unit.toLowerCase()} by signup provider`}
						categoryLabel={unit}
						data={stack.rows}
						emptyMessage="No signups in this period"
						exportFilename="growth-signups-by-provider"
						loading={signups.isPending}
						series={stack.series}
						stacked
						xKey="bucket"
						xTickFormatter={formatBucket}
					/>
				)}
			</ChartCard>

			<ChartCard
				actions={
					funnel.data && !isFunnelEmpty(funnelSegments) ? (
						<Button
							aria-label="Download CSV: Activation funnel"
							className="text-muted-foreground"
							onClick={() =>
								downloadCsv(
									`growth-funnel${segment === "none" ? "" : `-by-${segment}`}`,
									toCsv(
										funnelCsvRows(funnelSegments),
										[
											{ key: "segment", header: "Segment" },
											{ key: "stage", header: "Stage" },
											{ key: "count", header: "Users" },
											{ key: "cohortCount", header: "Base" },
											{ key: "observedCount", header: "Observed" },
											{ key: "conversion", header: "Conversion" },
										],
										{ bom: true },
									),
								)
							}
							size="icon-xs"
							title="Download CSV"
							type="button"
							variant="ghost"
						>
							<Download aria-hidden="true" />
						</Button>
					) : null
				}
				description={
					<>
						Users who signed up in the range. Conversion is from the stage
						before, among users whose window has closed; the rest are not yet
						observed.
						{liveFromLater && funnel.data?.liveFrom
							? ` Live stages count signups from ${LONG_DATE.format(new Date(funnel.data.liveFrom))}.`
							: ""}
						{segment === "none"
							? ""
							: " One funnel per segment: the five largest, then Other."}
					</>
				}
				title="Activation funnel"
			>
				{funnel.isError ? (
					<ErrorText error={funnel.error} />
				) : funnel.isPending ? (
					<Skeleton aria-busy="true" className="h-40 w-full" />
				) : isFunnelEmpty(funnelSegments) ? (
					<div className="flex h-40 w-full items-center justify-center border border-border border-dashed text-muted-foreground text-xs">
						No signups in this period
					</div>
				) : segment === "none" ? (
					<Funnel
						segment={funnelSegments[0] as FunnelSegmentResult}
						title="Activation funnel"
					/>
				) : (
					<div className="grid gap-6 lg:grid-cols-2">
						{funnelSegments.map((item) => (
							<Funnel
								compact
								key={item.segment}
								segment={item}
								title={`${SEGMENT_LABELS[segment]}: ${funnelSegmentLabel(item.segment)}`}
							/>
						))}
					</div>
				)}
			</ChartCard>

			<div className="grid gap-4 xl:grid-cols-2">
				<ChartCard
					description={`Hours from signup to first live, per signup week, among users who have gone live so far.${notSegmented}`}
					title="Time to first live"
				>
					{ttfl.isError ? (
						<ErrorText error={ttfl.error} />
					) : (
						<TrendLineChart
							ariaLabel="Median and p75 hours from signup to first live per signup week"
							categoryLabel="Signup week"
							data={ttflRows}
							emptyMessage="Nobody who signed up in this period has gone live yet"
							exportColumns={[
								{ key: "cohort", header: "Signup week" },
								{ key: "signups", header: "Signups" },
								{ key: "live", header: "Gone live" },
								{ key: "medianHours", header: "Median hours" },
								{ key: "p75Hours", header: "p75 hours" },
							]}
							exportFilename="growth-time-to-first-live"
							loading={ttfl.isPending}
							series={[
								{ key: "medianHours", label: "Median" },
								{ key: "p75Hours", label: "p75" },
							]}
							valueFormatter={formatHours}
							xKey="cohort"
							xTickFormatter={formatBucket}
						/>
					)}
				</ChartCard>

				<ChartCard
					description={`Share of each first-live week's cohort live again N weeks later. Last ${weeks} weeks.${notSegmented}`}
					title="Retention cohorts"
				>
					{retention.isError ? (
						<ErrorText error={retention.error} />
					) : (
						<CohortHeatmap
							caption="Weekly retention by first-live cohort"
							cohorts={retention.data?.cohorts}
							emptyMessage="No first-live cohorts in this period"
							exportFilename="growth-retention-cohorts"
							loading={retention.isPending}
						/>
					)}
				</ChartCard>
			</div>
		</div>
	);
}
