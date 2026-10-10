"use client";

import { Button } from "@VISP/ui/components/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	chartColorVar,
	chartSeriesColor,
} from "@VISP/ui/components/chart";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { formatAxisTick, formatChartNumber } from "@VISP/ui/lib/chart-format";
import { type CsvColumn, downloadCsv, toCsv } from "@VISP/ui/lib/csv";
import { cn } from "@VISP/ui/lib/utils";
import { Download } from "lucide-react";
import type * as React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	Line,
	LineChart,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";

/**
 * Typed wrappers over the shadcn chart primitives for the three forms the
 * admin dashboards use (trend line, column bars, ranked horizontal bars).
 * Pages pass rows + series and get loading/empty states, Intl number
 * formatting, an accessible label and a screen-reader table for free, so each
 * dashboard page stays declarative and small.
 */

/** One plotted measure. Colour defaults to the next `--chart-N` slot. */
export type ChartSeries<K extends string = string> = {
	key: K;
	label: string;
	color?: string;
};

type StringKey<T> = Extract<keyof T, string>;

type BaseChartProps<T extends object> = {
	data: readonly T[] | null | undefined;
	series: readonly ChartSeries<StringKey<T>>[];
	/** Accessible name for the whole figure, e.g. "Streaming hours per day". */
	ariaLabel: string;
	/** Optional longer description announced after the name. */
	description?: string;
	loading?: boolean;
	emptyMessage?: React.ReactNode;
	/** Plot height in px. */
	height?: number;
	/** Formats values in tooltips, labels and the screen-reader table. */
	valueFormatter?: (value: number) => string;
	locale?: string;
	/** Render a visually hidden data table (default true). */
	srTable?: boolean;
	/** Header for the category column of that table; defaults to the key. */
	categoryLabel?: string;
	className?: string;
	/**
	 * Show a "Download CSV" button that saves the plotted rows under this
	 * file name (`.csv` is appended when missing). Off when absent.
	 */
	exportFilename?: string;
	/**
	 * Override the exported columns. Defaults to the x/category key (headed by
	 * `categoryLabel`) followed by each series headed by its label.
	 */
	exportColumns?: readonly CsvColumn<T>[];
};

function readValue(row: object, key: string): unknown {
	return (row as Record<string, unknown>)[key];
}

function isPlottable(value: unknown): boolean {
	return typeof value === "number" && Number.isFinite(value);
}

/** True when there are no rows or no series has a single numeric value. */
export function isChartDataEmpty<T extends object>(
	data: readonly T[] | null | undefined,
	series: readonly ChartSeries[],
): boolean {
	if (!data?.length || !series.length) return true;
	return !data.some((row) =>
		series.some((s) => isPlottable(readValue(row, s.key))),
	);
}

function buildConfig(series: readonly ChartSeries[]): ChartConfig {
	const config: ChartConfig = {};
	series.forEach((s, index) => {
		config[s.key] = {
			label: s.label,
			color: s.color ?? chartSeriesColor(index),
		};
	});
	return config;
}

/**
 * The CSV a chart's download button produces: exactly the rows passed in
 * `data`, raw (unformatted) values so the file can be re-charted, with a BOM
 * so Excel reads UTF-8 category names correctly.
 */
export function chartToCsv<T extends object>({
	data,
	series,
	labelKey,
	categoryLabel,
	exportColumns,
}: {
	data: readonly T[];
	series: readonly ChartSeries<StringKey<T>>[];
	labelKey: StringKey<T>;
	categoryLabel?: string;
	exportColumns?: readonly CsvColumn<T>[];
}): string {
	const columns: readonly CsvColumn<T>[] = exportColumns ?? [
		{ key: labelKey, header: categoryLabel ?? labelKey },
		...series.map((s) => ({ key: s.key, header: s.label })),
	];
	return toCsv(data, columns, { bom: true });
}

function ChartFrame<T extends object>({
	ariaLabel,
	description,
	loading,
	emptyMessage,
	height,
	className,
	data,
	series,
	labelKey,
	categoryLabel,
	valueFormatter,
	srTable,
	config,
	exportFilename,
	exportColumns,
	children,
}: {
	ariaLabel: string;
	description?: string;
	loading?: boolean;
	emptyMessage?: React.ReactNode;
	height: number;
	className?: string;
	data: readonly T[] | null | undefined;
	series: readonly ChartSeries<StringKey<T>>[];
	labelKey: StringKey<T>;
	categoryLabel?: string;
	valueFormatter: (value: number) => string;
	srTable: boolean;
	config: ChartConfig;
	exportFilename?: string;
	exportColumns?: readonly CsvColumn<T>[];
	children: React.ComponentProps<typeof ChartContainer>["children"];
}) {
	if (loading) {
		return (
			<figure
				aria-label={ariaLabel}
				aria-busy="true"
				data-slot="chart-frame"
				data-state="loading"
				className={cn("m-0 w-full", className)}
			>
				<Skeleton className="w-full" style={{ height }} />
				<figcaption className="sr-only">Loading…</figcaption>
			</figure>
		);
	}

	if (isChartDataEmpty(data, series)) {
		return (
			<figure
				aria-label={ariaLabel}
				data-slot="chart-frame"
				data-state="empty"
				className={cn("m-0 w-full", className)}
			>
				<div
					className="flex w-full items-center justify-center border border-border border-dashed px-4 text-center text-muted-foreground text-xs"
					style={{ height }}
				>
					{emptyMessage ?? "No data for this period"}
				</div>
			</figure>
		);
	}

	return (
		<figure
			aria-label={ariaLabel}
			data-slot="chart-frame"
			data-state="ready"
			className={cn("m-0 w-full", className)}
		>
			{description ? (
				<figcaption className="sr-only">{description}</figcaption>
			) : null}
			{exportFilename && data ? (
				// A toolbar row rather than an overlay: the top-right of the plot is
				// where the latest (often highest) point and reference labels sit.
				<div data-slot="chart-toolbar" className="flex justify-end">
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={`Download CSV: ${ariaLabel}`}
						title="Download CSV"
						className="text-muted-foreground"
						onClick={() =>
							downloadCsv(
								exportFilename,
								chartToCsv({
									data,
									series,
									labelKey,
									categoryLabel,
									exportColumns,
								}),
							)
						}
					>
						<Download aria-hidden="true" />
					</Button>
				</div>
			) : null}
			<ChartContainer
				config={config}
				className="aspect-auto w-full"
				style={{ height }}
			>
				{children}
			</ChartContainer>
			{srTable && data ? (
				<table className="sr-only">
					<caption>{ariaLabel}</caption>
					<thead>
						<tr>
							<th scope="col">{categoryLabel ?? labelKey}</th>
							{series.map((s) => (
								<th key={s.key} scope="col">
									{s.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{data.map((row, index) => {
							const label = readValue(row, labelKey);
							return (
								<tr key={`${String(label)}-${index}`}>
									<th scope="row">{String(label ?? "")}</th>
									{series.map((s) => {
										const value = readValue(row, s.key);
										return (
											<td key={s.key}>
												{typeof value === "number"
													? valueFormatter(value)
													: formatChartNumber(null)}
											</td>
										);
									})}
								</tr>
							);
						})}
					</tbody>
				</table>
			) : null}
		</figure>
	);
}

function chartFormatters(
	locale: string | undefined,
	valueFormatter: ((value: number) => string) | undefined,
) {
	return {
		format:
			valueFormatter ??
			((value: number) => formatChartNumber(value, { locale })),
		tick: (value: unknown) => formatAxisTick(value, locale),
	};
}

const axisTick = { fontSize: 11 };

/** Reuses the x tick formatter for the tooltip header so both read the same. */
function tooltipLabel(
	xTickFormatter: ((value: string | number) => string) | undefined,
) {
	if (!xTickFormatter) return undefined;
	return (label: React.ReactNode) =>
		typeof label === "string" || typeof label === "number"
			? xTickFormatter(label)
			: label;
}

// ---------------------------------------------------------------------------
// TrendLineChart
// ---------------------------------------------------------------------------

export type TrendReferenceLine = { y: number; label?: string };
export type TrendAnnotation = { x: string | number; label?: string };

export type TrendLineChartProps<T extends object> = BaseChartProps<T> & {
	/** Row key holding the bucket label or date shown on the x axis. */
	xKey: StringKey<T>;
	xTickFormatter?: (value: string | number) => string;
	/** Horizontal target/threshold line, e.g. an SLO. */
	referenceLine?: TrendReferenceLine;
	/** Vertical markers for releases/incidents; `x` must match an xKey value. */
	annotations?: readonly TrendAnnotation[];
	curve?: "monotone" | "linear" | "step";
	/** Bridge gaps (null values) instead of breaking the line. */
	connectNulls?: boolean;
};

export function TrendLineChart<T extends object>({
	data,
	series,
	xKey,
	xTickFormatter,
	referenceLine,
	annotations,
	curve = "monotone",
	connectNulls = false,
	ariaLabel,
	description,
	loading,
	emptyMessage,
	height = 240,
	valueFormatter,
	locale,
	srTable = true,
	categoryLabel,
	className,
	exportFilename,
	exportColumns,
}: TrendLineChartProps<T>) {
	const { format, tick } = chartFormatters(locale, valueFormatter);
	const config = buildConfig(series);
	// A lone point has no segment to draw, so show markers for short series.
	const showDots = (data?.length ?? 0) <= 2;

	return (
		<ChartFrame
			ariaLabel={ariaLabel}
			description={description}
			loading={loading}
			emptyMessage={emptyMessage}
			height={height}
			className={className}
			data={data}
			series={series}
			labelKey={xKey}
			valueFormatter={format}
			srTable={srTable}
			categoryLabel={categoryLabel}
			config={config}
			exportFilename={exportFilename}
			exportColumns={exportColumns}
		>
			<LineChart
				data={data ? [...data] : []}
				margin={{
					top: annotations?.length ? 20 : 8,
					right: 12,
					left: 0,
					bottom: 0,
				}}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey={xKey}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
					tick={axisTick}
					tickFormatter={xTickFormatter}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					tickMargin={4}
					width="auto"
					tick={axisTick}
					tickFormatter={tick}
				/>
				<ChartTooltip
					cursor
					content={
						<ChartTooltipContent
							indicator="line"
							valueFormatter={format}
							labelFormatter={tooltipLabel(xTickFormatter)}
						/>
					}
				/>
				{series.length > 1 ? (
					<ChartLegend content={<ChartLegendContent />} />
				) : null}
				{referenceLine ? (
					<ReferenceLine
						y={referenceLine.y}
						stroke="var(--muted-foreground)"
						strokeDasharray="4 4"
						ifOverflow="extendDomain"
						label={
							referenceLine.label
								? {
										value: referenceLine.label,
										position: "insideTopRight",
										fill: "var(--muted-foreground)",
										fontSize: 11,
									}
								: undefined
						}
					/>
				) : null}
				{annotations?.map((annotation) => (
					<ReferenceLine
						key={`${annotation.x}-${annotation.label ?? ""}`}
						x={annotation.x}
						stroke="var(--border)"
						label={
							annotation.label
								? {
										value: annotation.label,
										position: "top",
										fill: "var(--muted-foreground)",
										fontSize: 11,
									}
								: undefined
						}
					/>
				))}
				{series.map((s) => (
					<Line
						key={s.key}
						dataKey={s.key}
						name={s.label}
						type={curve}
						stroke={chartColorVar(s.key)}
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						dot={showDots ? { r: 4, fill: chartColorVar(s.key) } : false}
						activeDot={{ r: 4 }}
						connectNulls={connectNulls}
						isAnimationActive={false}
					/>
				))}
			</LineChart>
		</ChartFrame>
	);
}

// ---------------------------------------------------------------------------
// BarSeriesChart (vertical columns, grouped or stacked)
// ---------------------------------------------------------------------------

export type BarSeriesChartProps<T extends object> = BaseChartProps<T> & {
	xKey: StringKey<T>;
	xTickFormatter?: (value: string | number) => string;
	/** Stack series into one column per bucket instead of grouping them. */
	stacked?: boolean;
};

export function BarSeriesChart<T extends object>({
	data,
	series,
	xKey,
	xTickFormatter,
	stacked = false,
	ariaLabel,
	description,
	loading,
	emptyMessage,
	height = 240,
	valueFormatter,
	locale,
	srTable = true,
	categoryLabel,
	className,
	exportFilename,
	exportColumns,
}: BarSeriesChartProps<T>) {
	const { format, tick } = chartFormatters(locale, valueFormatter);
	const config = buildConfig(series);

	return (
		<ChartFrame
			ariaLabel={ariaLabel}
			description={description}
			loading={loading}
			emptyMessage={emptyMessage}
			height={height}
			className={className}
			data={data}
			series={series}
			labelKey={xKey}
			valueFormatter={format}
			srTable={srTable}
			categoryLabel={categoryLabel}
			config={config}
			exportFilename={exportFilename}
			exportColumns={exportColumns}
		>
			<BarChart
				data={data ? [...data] : []}
				margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey={xKey}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={16}
					tick={axisTick}
					tickFormatter={xTickFormatter}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					tickMargin={4}
					width="auto"
					tick={axisTick}
					tickFormatter={tick}
				/>
				<ChartTooltip
					cursor
					content={
						<ChartTooltipContent
							valueFormatter={format}
							labelFormatter={tooltipLabel(xTickFormatter)}
						/>
					}
				/>
				{series.length > 1 ? (
					<ChartLegend content={<ChartLegendContent />} />
				) : null}
				{series.map((s, index) => {
					// Only the top segment of a stack gets the rounded data-end.
					const isTop = !stacked || index === series.length - 1;
					return (
						<Bar
							key={s.key}
							dataKey={s.key}
							name={s.label}
							fill={chartColorVar(s.key)}
							stackId={stacked ? "stack" : undefined}
							radius={isTop ? [4, 4, 0, 0] : 0}
							maxBarSize={24}
							isAnimationActive={false}
						/>
					);
				})}
			</BarChart>
		</ChartFrame>
	);
}

// ---------------------------------------------------------------------------
// HorizontalBarChart (ranked categories, e.g. top platforms)
// ---------------------------------------------------------------------------

export type HorizontalBarChartProps<T extends object> = BaseChartProps<T> & {
	/** Row key holding the category name shown on the y axis. */
	categoryKey: StringKey<T>;
	/** Width reserved for category labels in px. */
	categoryWidth?: number;
	/** Print values at the bar tips (default: on for a single series). */
	showValues?: boolean;
};

export function HorizontalBarChart<T extends object>({
	data,
	series,
	categoryKey,
	categoryWidth = 120,
	showValues,
	ariaLabel,
	description,
	loading,
	emptyMessage,
	height,
	valueFormatter,
	locale,
	srTable = true,
	categoryLabel,
	className,
	exportFilename,
	exportColumns,
}: HorizontalBarChartProps<T>) {
	const { format } = chartFormatters(locale, valueFormatter);
	const config = buildConfig(series);
	const labelValues = showValues ?? series.length === 1;
	// Height follows the row count so a top-5 and a top-20 both read well.
	const rows = data?.length ?? 0;
	const resolvedHeight =
		height ?? Math.max(120, rows * (series.length * 18 + 14) + 16);

	return (
		<ChartFrame
			ariaLabel={ariaLabel}
			description={description}
			loading={loading}
			emptyMessage={emptyMessage}
			height={resolvedHeight}
			className={className}
			data={data}
			series={series}
			labelKey={categoryKey}
			valueFormatter={format}
			srTable={srTable}
			categoryLabel={categoryLabel}
			config={config}
			exportFilename={exportFilename}
			exportColumns={exportColumns}
		>
			<BarChart
				data={data ? [...data] : []}
				layout="vertical"
				margin={{ top: 0, right: labelValues ? 48 : 12, left: 0, bottom: 0 }}
			>
				<CartesianGrid horizontal={false} />
				<YAxis
					type="category"
					dataKey={categoryKey}
					tickLine={false}
					axisLine={false}
					width={categoryWidth}
					tick={axisTick}
				/>
				<XAxis type="number" hide />
				<ChartTooltip
					cursor
					content={<ChartTooltipContent valueFormatter={format} />}
				/>
				{series.length > 1 ? (
					<ChartLegend content={<ChartLegendContent />} />
				) : null}
				{series.map((s) => (
					<Bar
						key={s.key}
						dataKey={s.key}
						name={s.label}
						fill={chartColorVar(s.key)}
						radius={[0, 4, 4, 0]}
						maxBarSize={18}
						isAnimationActive={false}
					>
						{labelValues ? (
							<LabelList
								dataKey={s.key}
								position="right"
								offset={6}
								className="fill-foreground"
								fontSize={11}
								formatter={(value) =>
									typeof value === "number" ? format(value) : value
								}
							/>
						) : null}
					</Bar>
				))}
			</BarChart>
		</ChartFrame>
	);
}
