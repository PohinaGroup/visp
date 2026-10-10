import { Skeleton } from "@VISP/ui/components/skeleton";
import {
	computeDeltaPct,
	type DeltaTone,
	deltaDirection,
	deltaTone,
	describeDelta,
	formatChartNumber,
	formatDeltaPct,
	MISSING_VALUE,
	sparklinePoints,
} from "@VISP/ui/lib/chart-format";
import { cn } from "@VISP/ui/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";

/**
 * Headline metric tile: value, change vs the previous period, and an optional
 * sparkline. The delta colour encodes *meaning* (good/bad) rather than sign,
 * so cost and latency tiles set `invert` and turn red when they go up. Tone is
 * also spelled out for screen readers because colour and arrows are visual.
 */
export type KpiTileProps = {
	label: string;
	value: number | null | undefined;
	/** Pre-formatted display value (e.g. "12.4 h"); wins over `formatValue`. */
	formattedValue?: string;
	/** Formatter for `value` and `previous`; defaults to Intl compact. */
	formatValue?: (value: number) => string;
	/** Previous-period value; used to derive the delta when `deltaPct` is absent. */
	previous?: number | null;
	/** Change in percent units (12.5 = +12.5%). Overrides the derived delta. */
	deltaPct?: number | null;
	/** Set for metrics where up is bad (cost, latency, error rate). */
	invert?: boolean;
	/** Text after the delta, e.g. "vs last week". */
	comparisonLabel?: string;
	/** Recent samples, oldest first; the last point is the current period. */
	sparkline?: readonly number[];
	href?: string;
	onClick?: React.MouseEventHandler<HTMLButtonElement>;
	loading?: boolean;
	locale?: string;
	className?: string;
};

const toneClass: Record<DeltaTone, string> = {
	good: "text-success",
	bad: "text-destructive",
	neutral: "text-muted-foreground",
};

const SPARK_W = 96;
const SPARK_H = 28;

function Sparkline({ values }: { values: readonly number[] }) {
	const { points, last } = sparklinePoints(values, SPARK_W, SPARK_H, 3);
	if (!points) return null;
	return (
		<svg
			aria-hidden="true"
			data-slot="kpi-sparkline"
			width={SPARK_W}
			height={SPARK_H}
			viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
			className="shrink-0 overflow-visible text-muted-foreground"
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeOpacity={0.6}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{last ? (
				<circle
					cx={last.x}
					cy={last.y}
					r={2.5}
					fill="var(--chart-1)"
					stroke="var(--card)"
					strokeWidth={1}
				/>
			) : null}
		</svg>
	);
}

function KpiTile({
	label,
	value,
	formattedValue,
	formatValue,
	previous,
	deltaPct,
	invert = false,
	comparisonLabel = "vs previous period",
	sparkline,
	href,
	onClick,
	loading = false,
	locale,
	className,
}: KpiTileProps) {
	const format =
		formatValue ?? ((n: number) => formatChartNumber(n, { locale }));
	const display =
		formattedValue ??
		(typeof value === "number" && Number.isFinite(value)
			? format(value)
			: MISSING_VALUE);
	const delta =
		deltaPct !== undefined ? deltaPct : computeDeltaPct(value, previous);
	const direction = deltaDirection(delta);
	const tone = deltaTone(delta, invert);
	const DeltaIcon =
		direction === "up"
			? ArrowUpRight
			: direction === "down"
				? ArrowDownRight
				: Minus;
	const previousText =
		typeof previous === "number" && Number.isFinite(previous)
			? `Previous: ${format(previous)}`
			: undefined;

	const body = loading ? (
		<>
			<span className="text-muted-foreground text-xs">{label}</span>
			<Skeleton className="h-7 w-24" />
			<Skeleton className="h-3.5 w-32" />
			<span className="sr-only">Loading</span>
		</>
	) : (
		<>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="flex items-end justify-between gap-3">
				<span className="font-semibold text-2xl text-foreground leading-none tracking-tight">
					{display}
				</span>
				{sparkline && sparkline.length > 0 ? (
					<Sparkline values={sparkline} />
				) : null}
			</span>
			<span
				className="flex min-h-4 items-center gap-1 text-xs"
				title={previousText}
			>
				{delta === null || delta === undefined ? (
					<span className="text-muted-foreground">No comparison</span>
				) : (
					<>
						<span
							aria-hidden="true"
							data-tone={tone}
							className={cn(
								"inline-flex items-center gap-0.5 font-medium tabular-nums",
								toneClass[tone],
							)}
						>
							<DeltaIcon className="size-3.5" />
							{formatDeltaPct(delta, locale)}
						</span>
						<span aria-hidden="true" className="text-muted-foreground">
							{comparisonLabel}
						</span>
						<span className="sr-only">
							{describeDelta(delta, { invert, comparisonLabel, locale })}
							{previousText ? `. ${previousText}` : ""}
						</span>
					</>
				)}
			</span>
		</>
	);

	const shared = cn(
		"flex min-w-0 flex-col gap-2 rounded-none bg-card p-4 text-left text-card-foreground ring-1 ring-foreground/10",
		className,
	);
	const interactive =
		"outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring";

	if (href) {
		return (
			<a
				href={href}
				data-slot="kpi-tile"
				aria-busy={loading || undefined}
				className={cn(shared, interactive)}
			>
				{body}
			</a>
		);
	}

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				data-slot="kpi-tile"
				aria-busy={loading || undefined}
				className={cn(shared, interactive)}
			>
				{body}
			</button>
		);
	}

	return (
		<div
			data-slot="kpi-tile"
			aria-busy={loading || undefined}
			className={shared}
		>
			{body}
		</div>
	);
}

export { KpiTile };
