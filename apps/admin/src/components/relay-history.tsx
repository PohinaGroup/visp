import { TrendLineChart } from "@VISP/ui/components/charts";
import { cn } from "@VISP/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usageTone } from "../lib/format";
import {
	peakOf,
	RELAY_HISTORY_DAYS,
	type RelayHistory,
	UTILISATION_WARN_PCT,
	type UtilisationMetric,
	type UtilisationPoint,
} from "../lib/relay-history";

const SPARK_W = 72;
const SPARK_H = 20;
const SPARK_PAD = 2;

/** The four signals that say a relay is filling up, in table order. */
const SPARK_METRICS = [
	{ key: "cpuPct", label: "CPU" },
	{ key: "memPct", label: "RAM" },
	{ key: "diskPct", label: "Disk" },
	{ key: "pathsPct", label: "Paths" },
] as const satisfies readonly { key: UtilisationMetric; label: string }[];

function formatPct(value: number | null) {
	return value === null ? "—" : `${Math.round(value)}%`;
}

const hourLabel = new Intl.DateTimeFormat("en-FI", {
	weekday: "short",
	hour: "2-digit",
	minute: "2-digit",
});
function formatHour(value: string | number) {
	return hourLabel.format(new Date(value));
}

/**
 * Utilisation sparkline on a fixed 0–100 % axis (wider only if a value goes
 * past 100). KpiTile's sparkline scales to the series' own range, which reads
 * trends well but makes a 2 → 3 % wobble look like a spike; here every row
 * shares the same scale so the dashed 80 % mark sits at the same height and
 * rows can be compared at a glance. Hours without a sample break the line.
 */
function UtilisationSparkline({
	points,
	metric,
}: {
	points: readonly UtilisationPoint[];
	metric: UtilisationMetric;
}) {
	const peak = peakOf(points, metric);
	const max = Math.max(100, peak ?? 0);
	const innerW = SPARK_W - SPARK_PAD * 2;
	const innerH = SPARK_H - SPARK_PAD * 2;
	const step = points.length > 1 ? innerW / (points.length - 1) : 0;
	const y = (value: number) =>
		SPARK_PAD + innerH - (Math.min(value, max) / max) * innerH;
	let path = "";
	let penDown = false;
	points.forEach((point, index) => {
		const value = point[metric];
		if (value === null) {
			penDown = false;
			return;
		}
		const x = SPARK_PAD + index * step;
		// A lone hour between gaps still shows as a dot via the round cap.
		path += penDown
			? ` L${x.toFixed(1)} ${y(value).toFixed(1)}`
			: ` M${x.toFixed(1)} ${y(value).toFixed(1)} l0 0`;
		penDown = true;
	});
	const warnY = y(UTILISATION_WARN_PCT);
	return (
		<svg
			aria-hidden="true"
			className={cn("shrink-0 overflow-visible", usageTone(peak ?? 0))}
			height={SPARK_H}
			viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
			width={SPARK_W}
		>
			<line
				stroke="var(--border)"
				strokeDasharray="2 2"
				x1={SPARK_PAD}
				x2={SPARK_W - SPARK_PAD}
				y1={warnY}
				y2={warnY}
			/>
			{path ? (
				<path
					d={path.trim()}
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
				/>
			) : null}
		</svg>
	);
}

/**
 * The row's 7-day summary: one sparkline per metric with its peak, as a
 * button that opens the full charts below the row.
 */
export function RelaySparklines({
	name,
	points,
	expanded,
	loading,
	onToggle,
}: {
	name: string;
	points: readonly UtilisationPoint[] | undefined;
	expanded: boolean;
	loading: boolean;
	onToggle: () => void;
}) {
	if (loading) {
		return <p className="text-muted-foreground text-xs">Loading history…</p>;
	}
	if (
		!points ||
		SPARK_METRICS.every(({ key }) => peakOf(points, key) === null)
	) {
		return (
			<p className="text-muted-foreground text-xs">
				No history in the last {RELAY_HISTORY_DAYS} days
			</p>
		);
	}
	const Chevron = expanded ? ChevronDown : ChevronRight;
	return (
		<button
			aria-expanded={expanded}
			aria-label={`${expanded ? "Hide" : "Show"} ${RELAY_HISTORY_DAYS}-day history for ${name}`}
			className="grid grid-cols-[auto_1fr] items-center gap-x-2 rounded-sm p-1 text-left text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
			onClick={onToggle}
			type="button"
		>
			<div className="grid gap-0.5">
				{SPARK_METRICS.map(({ key, label }) => {
					const peak = peakOf(points, key);
					return (
						<div className="flex items-center gap-2" key={key}>
							<span className="w-9 text-muted-foreground">{label}</span>
							<UtilisationSparkline metric={key} points={points} />
							<span
								className={cn(
									"w-9 text-right tabular-nums",
									usageTone(peak ?? 0),
								)}
							>
								{formatPct(peak)}
							</span>
							<span className="sr-only">
								{label} peak {formatPct(peak)} over {RELAY_HISTORY_DAYS} days.
							</span>
						</div>
					);
				})}
			</div>
			<Chevron aria-hidden="true" className="size-4 text-muted-foreground" />
		</button>
	);
}

const reference = {
	y: UTILISATION_WARN_PCT,
	label: `${UTILISATION_WARN_PCT}%`,
};

/** Full 7-day charts for one relay, opened from its sparklines. */
export function RelayHistoryDetail({
	history,
	points,
}: {
	history: RelayHistory;
	points: readonly UtilisationPoint[];
}) {
	const charts: {
		title: string;
		detail: string;
		series: { key: UtilisationMetric; label: string }[];
	}[] = [
		{
			title: "CPU load ÷ cores",
			detail: "Hourly mean and peak 1-minute load against core count.",
			series: [
				{ key: "cpuPct", label: "Mean" },
				{ key: "cpuPeakPct", label: "Peak" },
			],
		},
		{
			title: "RAM used",
			detail: "Hourly peak.",
			series: [{ key: "memPct", label: "RAM" }],
		},
		{
			title: "Disk used",
			detail: "Hourly peak.",
			series: [{ key: "diskPct", label: "Disk" }],
		},
		{
			title: "Live paths ÷ capacity",
			detail: `Hourly peak against ${history.capacityPaths} configured paths.`,
			series: [{ key: "pathsPct", label: "Paths" }],
		},
	];
	if (history.maxForwarders > 0) {
		charts.push({
			title: "Forwarders ÷ max",
			detail: `Hourly peak against ${history.maxForwarders} forwarder slots.`,
			series: [{ key: "forwardersPct", label: "Forwarders" }],
		});
	}
	return (
		<div className="grid gap-4 py-2 md:grid-cols-2">
			{charts.map((chart) => (
				<div className="grid gap-1" key={chart.title}>
					<p className="font-medium text-sm">{chart.title}</p>
					<p className="text-muted-foreground text-xs">{chart.detail}</p>
					<TrendLineChart
						ariaLabel={`${history.name} ${chart.title}, last ${RELAY_HISTORY_DAYS} days`}
						categoryLabel="Hour"
						data={points}
						emptyMessage="No samples in this period"
						height={160}
						referenceLine={reference}
						series={chart.series}
						valueFormatter={(value) => `${Math.round(value)}%`}
						xKey="t"
						xTickFormatter={formatHour}
					/>
				</div>
			))}
		</div>
	);
}
