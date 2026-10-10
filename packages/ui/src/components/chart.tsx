"use client";

import { formatChartNumber } from "@VISP/ui/lib/chart-format";
import { cn } from "@VISP/ui/lib/utils";
import * as React from "react";
import type {
	LegendPayload,
	TooltipPayloadEntry,
	TooltipValueType,
} from "recharts";
import * as RechartsPrimitive from "recharts";

/**
 * shadcn "chart" primitives adapted to this repo: sharp corners and xs type to
 * match the base-lyra style, colours resolved from the `--chart-1..5` theme
 * tokens, and keys sanitised before they become CSS variable names (data keys
 * from API rows can contain dots or spaces).
 */

const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = Record<
	string,
	{
		label?: React.ReactNode;
		icon?: React.ComponentType;
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<keyof typeof THEMES, string> }
	)
>;

type ChartContextProps = {
	config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
	const context = React.useContext(ChartContext);
	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}
	return context;
}

/** Turns a config/data key into a safe CSS custom-property suffix. */
function chartKey(key: string): string {
	return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** `var(--color-<key>)` for a series key declared in the ChartConfig. */
function chartColorVar(key: string): string {
	return `var(--color-${chartKey(key)})`;
}

/**
 * Default colour for the n-th series (0-based). Slots are assigned in fixed
 * order and never cycled: past the fifth series callers should fold the tail
 * into an "Other" series, which gets the muted ink rather than a repeat hue.
 */
function chartSeriesColor(index: number): string {
	return index >= 0 && index < 5
		? `var(--chart-${index + 1})`
		: "var(--muted-foreground)";
}

function ChartContainer({
	id,
	className,
	children,
	config,
	initialDimension = { width: 320, height: 200 },
	...props
}: React.ComponentProps<"div"> & {
	config: ChartConfig;
	children: React.ComponentProps<
		typeof RechartsPrimitive.ResponsiveContainer
	>["children"];
	initialDimension?: {
		width: number;
		height: number;
	};
}) {
	const uniqueId = React.useId();
	const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				data-slot="chart"
				data-chart={chartId}
				className={cn(
					"flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
					className,
				)}
				{...props}
			>
				<ChartStyle id={chartId} config={config} />
				<RechartsPrimitive.ResponsiveContainer
					initialDimension={initialDimension}
				>
					{children}
				</RechartsPrimitive.ResponsiveContainer>
			</div>
		</ChartContext.Provider>
	);
}

/**
 * Emits `--color-<key>` variables scoped to one chart. Rendered as a text
 * child of <style> (not dangerouslySetInnerHTML); values come from the
 * developer-authored config, never from API data.
 */
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
	const colorConfig = Object.entries(config).filter(
		([, entry]) => entry.theme ?? entry.color,
	);

	if (!colorConfig.length) {
		return null;
	}

	const css = Object.entries(THEMES)
		.map(([theme, prefix]) => {
			const vars = colorConfig
				.map(([key, itemConfig]) => {
					const color =
						itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
						itemConfig.color;
					return color ? `  --color-${chartKey(key)}: ${color};` : null;
				})
				.filter(Boolean)
				.join("\n");
			return `${prefix} [data-chart=${id}] {\n${vars}\n}`;
		})
		.join("\n");

	return <style>{css}</style>;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
	active?: boolean;
	payload?: ReadonlyArray<TooltipPayloadEntry>;
	label?: React.ReactNode;
	labelFormatter?: (
		label: React.ReactNode,
		payload: ReadonlyArray<TooltipPayloadEntry>,
	) => React.ReactNode;
	labelClassName?: string;
	formatter?: (
		value: TooltipValueType | undefined,
		name: string | number | undefined,
		item: TooltipPayloadEntry,
		index: number,
		payload: unknown,
	) => React.ReactNode;
	/** Formats numeric values; defaults to Intl with auto-compaction. */
	valueFormatter?: (value: number) => string;
	color?: string;
	hideLabel?: boolean;
	hideIndicator?: boolean;
	indicator?: "line" | "dot" | "dashed";
	nameKey?: string;
	labelKey?: string;
};

function ChartTooltipContent({
	active,
	payload,
	className,
	indicator = "dot",
	hideLabel = false,
	hideIndicator = false,
	label,
	labelFormatter,
	labelClassName,
	formatter,
	valueFormatter = (value) => formatChartNumber(value),
	color,
	nameKey,
	labelKey,
}: ChartTooltipContentProps) {
	const { config } = useChart();

	const tooltipLabel = React.useMemo(() => {
		if (hideLabel || !payload?.length) {
			return null;
		}

		const [item] = payload;
		const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
		const itemConfig = getPayloadConfigFromPayload(config, item, key);
		const value =
			!labelKey && typeof label === "string"
				? (config[label]?.label ?? label)
				: itemConfig?.label;

		if (labelFormatter) {
			return (
				<div className={cn("font-medium", labelClassName)}>
					{labelFormatter(value ?? label, payload)}
				</div>
			);
		}

		if (!value) {
			return null;
		}

		return <div className={cn("font-medium", labelClassName)}>{value}</div>;
	}, [
		label,
		labelFormatter,
		payload,
		hideLabel,
		labelClassName,
		config,
		labelKey,
	]);

	if (!active || !payload?.length) {
		return null;
	}

	const nestLabel = payload.length === 1 && indicator !== "dot";

	return (
		<div
			className={cn(
				"grid min-w-32 items-start gap-1.5 rounded-none border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
				className,
			)}
		>
			{!nestLabel ? tooltipLabel : null}
			<div className="grid gap-1.5">
				{payload
					.filter((item) => item.type !== "none")
					.map((item, index) => {
						const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
						const itemConfig = getPayloadConfigFromPayload(config, item, key);
						const indicatorColor =
							color ?? item.payload?.fill ?? item.color ?? item.stroke;

						return (
							<div
								key={`${item.dataKey ?? index}`}
								className={cn(
									"flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
									indicator === "dot" && "items-center",
								)}
							>
								{formatter && item?.value !== undefined && item.name ? (
									formatter(item.value, item.name, item, index, item.payload)
								) : (
									<>
										{itemConfig?.icon ? (
											<itemConfig.icon />
										) : (
											!hideIndicator && (
												<div
													className={cn(
														"shrink-0 rounded-none border-(--color-border) bg-(--color-bg)",
														{
															"h-2.5 w-2.5": indicator === "dot",
															"w-1": indicator === "line",
															"w-0 border-[1.5px] border-dashed bg-transparent":
																indicator === "dashed",
															"my-0.5": nestLabel && indicator === "dashed",
														},
													)}
													style={
														{
															"--color-bg": indicatorColor,
															"--color-border": indicatorColor,
														} as React.CSSProperties
													}
												/>
											)
										)}
										<div
											className={cn(
												"flex flex-1 justify-between gap-4 leading-none",
												nestLabel ? "items-end" : "items-center",
											)}
										>
											<div className="grid gap-1.5">
												{nestLabel ? tooltipLabel : null}
												<span className="text-muted-foreground">
													{itemConfig?.label ?? item.name}
												</span>
											</div>
											{item.value !== undefined && item.value !== null && (
												<span className="font-medium font-mono text-foreground tabular-nums">
													{typeof item.value === "number"
														? valueFormatter(item.value)
														: String(item.value)}
												</span>
											)}
										</div>
									</>
								)}
							</div>
						);
					})}
			</div>
		</div>
	);
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
	className,
	hideIcon = false,
	payload,
	verticalAlign = "bottom",
	nameKey,
}: React.ComponentProps<"div"> & {
	hideIcon?: boolean;
	payload?: ReadonlyArray<LegendPayload>;
	verticalAlign?: "top" | "bottom" | "middle";
	nameKey?: string;
}) {
	const { config } = useChart();

	if (!payload?.length) {
		return null;
	}

	return (
		<ul
			className={cn(
				"flex flex-wrap items-center justify-center gap-x-4 gap-y-1",
				verticalAlign === "top" ? "pb-3" : "pt-3",
				className,
			)}
		>
			{payload
				.filter((item) => item.type !== "none")
				.map((item) => {
					const key = `${nameKey ?? item.dataKey ?? "value"}`;
					const itemConfig = getPayloadConfigFromPayload(config, item, key);

					return (
						<li
							key={key}
							className="flex items-center gap-1.5 text-muted-foreground [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
						>
							{itemConfig?.icon && !hideIcon ? (
								<itemConfig.icon />
							) : (
								<div
									aria-hidden="true"
									className="h-2 w-2 shrink-0 rounded-none"
									style={{
										backgroundColor: item.color,
									}}
								/>
							)}
							{itemConfig?.label ?? item.value}
						</li>
					);
				})}
		</ul>
	);
}

/** Resolves the config entry for a tooltip/legend payload item. */
function getPayloadConfigFromPayload(
	config: ChartConfig,
	payload: unknown,
	key: string,
) {
	if (typeof payload !== "object" || payload === null) {
		return undefined;
	}

	const payloadPayload =
		"payload" in payload &&
		typeof payload.payload === "object" &&
		payload.payload !== null
			? payload.payload
			: undefined;

	let configLabelKey: string = key;

	if (
		key in payload &&
		typeof payload[key as keyof typeof payload] === "string"
	) {
		configLabelKey = payload[key as keyof typeof payload] as string;
	} else if (
		payloadPayload &&
		key in payloadPayload &&
		typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
	) {
		configLabelKey = payloadPayload[
			key as keyof typeof payloadPayload
		] as string;
	}

	return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartStyle,
	ChartTooltip,
	ChartTooltipContent,
	chartColorVar,
	chartKey,
	chartSeriesColor,
	useChart,
};
